import "dotenv/config";
import express from "express";
import helmet from "helmet";
import httpProxy from "http-proxy";
import crypto from "node:crypto";
import pino from "pino";
import { enforceZeroTrust } from "./core/authMiddleware.js";
import { checkDistributedRateLimit } from "./core/rateLimiter.js";
import { evaluateRequest } from "./core/firewallEngine.js";
import { targets } from "./proxy/targets.js";

const app = express();
const logger = pino({ name: "firewallx-gateway" });
const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });

app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, "gateway request");
  next();
});

const postDecision = async (payload: Record<string, unknown>) => {
  const baseUrl = process.env.CONTROL_PLANE_URL ?? "http://localhost:5001";
  await fetch(`${baseUrl}/api/ingest/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
};

app.use(async (req, res, next) => {
  const start = Date.now();
  const forwardedIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
  const ip = forwardedIp || req.ip || "0.0.0.0";
  const zeroTrust = enforceZeroTrust(req);

  if (!zeroTrust.ok) {
    const deniedLog = {
      requestId: crypto.randomUUID(),
      application: String(req.headers["x-app-name"] ?? "default-app"),
      environment: String(req.headers["x-env"] ?? "prod"),
      ip,
      method: req.method,
      endpoint: req.path,
      protocol: req.secure ? "HTTPS" : "HTTP",
      domain: req.headers.host,
      port: Number(process.env.PORT ?? 8080),
      headers: req.headers,
      action: "BLOCK",
      riskScore: 92,
      userRole: undefined,
      reason: `zero-trust deny: ${zeroTrust.reason}`,
      statusCode: 403,
      responseMs: Date.now() - start
    };
    await postDecision(deniedLog);
    return res.status(403).json({ message: "blocked", reason: deniedLog.reason, risk: deniedLog.riskScore });
  }

  const limit = await checkDistributedRateLimit(ip, req.path);
  if (limit.exceeded) {
    const rateLog = {
      requestId: crypto.randomUUID(),
      application: String(req.headers["x-app-name"] ?? "default-app"),
      environment: String(req.headers["x-env"] ?? "prod"),
      ip,
      method: req.method,
      endpoint: req.path,
      protocol: req.secure ? "HTTPS" : "HTTP",
      domain: req.headers.host,
      port: Number(process.env.PORT ?? 8080),
      headers: req.headers,
      action: "RATE_LIMIT",
      riskScore: 70,
      userRole: zeroTrust.role,
      reason: `distributed limiter exceeded: hits=${limit.hits}`,
      statusCode: 429,
      responseMs: Date.now() - start
    };
    await postDecision(rateLog);
    return res.status(429).json({ message: "rate limited", reason: rateLog.reason, risk: rateLog.riskScore });
  }

  const decision = await evaluateRequest(req);

  const commonLog = {
    requestId: crypto.randomUUID(),
    application: String(req.headers["x-app-name"] ?? "default-app"),
    environment: String(req.headers["x-env"] ?? "prod"),
    ip,
    method: req.method,
    endpoint: req.path,
    protocol: req.secure ? "HTTPS" : "HTTP",
    domain: req.headers.host,
    port: Number(process.env.PORT ?? 8080),
    headers: req.headers,
    action: decision.action,
    riskScore: decision.riskScore,
    userRole: zeroTrust.role,
    reason: decision.reason,
    responseMs: Date.now() - start
  };

  if (decision.action === "BLOCK") {
    await postDecision({ ...commonLog, statusCode: 403 });
    return res.status(403).json({ message: "blocked", reason: decision.reason, risk: decision.riskScore });
  }

  if (decision.action === "RATE_LIMIT") {
    await postDecision({ ...commonLog, statusCode: 429 });
    return res.status(429).json({ message: "rate limited", reason: decision.reason, risk: decision.riskScore });
  }

  res.on("finish", async () => {
    await postDecision({ ...commonLog, statusCode: res.statusCode, responseMs: Date.now() - start });
  });

  return next();
});

app.use((req, res) => {
  const appName = String(req.headers["x-app-name"] ?? "default");
  const target = targets[appName] ?? targets.default;
  proxy.web(req, res, { target }, (error) => {
    logger.error({ err: error }, "proxy error");
    res.status(502).json({ error: "bad gateway", target });
  });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => logger.info(`Gateway listening on :${port}`));

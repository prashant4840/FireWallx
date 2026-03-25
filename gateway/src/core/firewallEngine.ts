import jwt from "jsonwebtoken";
import type { Request } from "express";
import { isAnomalousTraffic, trackTraffic } from "./adaptiveEngine.js";
import { getRules } from "./policyClient.js";
import { calculateRisk } from "./riskEngine.js";
import { addTemporaryBlock, isTemporaryBlocked } from "./selfHealing.js";
import { getIpThreatIntel } from "./threatIntelService.js";
import type { Decision, FirewallRule } from "../types/firewall.js";

const counters = new Map<string, { hits: number; resetAt: number; failed: number }>();
const badIps = new Set<string>(["10.10.10.10"]);

const endpointSensitivity = (path: string): number => {
  if (path.startsWith("/admin")) return 10;
  if (path.startsWith("/auth") || path.includes("/payments")) return 8;
  return 2;
};

const matchRule = (rule: FirewallRule, req: Request, role?: string): boolean => {
  if (!rule.enabled) return false;

  const host = req.headers.host ?? "";
  const protocol = req.secure ? "https" : "http";

  if (rule.protocol && rule.protocol.toLowerCase() !== protocol) return false;
  if (rule.port && Number(process.env.PORT ?? 8080) !== rule.port) return false;
  if (rule.domainPattern && !host.includes(rule.domainPattern)) return false;
  if (rule.pathPattern && !req.path.includes(rule.pathPattern)) return false;
  if (rule.role && rule.role !== role) return false;

  return true;
};

export const evaluateRequest = async (req: Request): Promise<Decision> => {
  const forwardedIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
  const ip = forwardedIp || req.ip || "0.0.0.0";
  const app = String(req.headers["x-app-name"] ?? "default-app");
  const env = String(req.headers["x-env"] ?? "prod");
  const key = `${ip}:${req.path}`;

  const current = counters.get(key) ?? { hits: 0, resetAt: Date.now() + 1000, failed: 0 };
  if (Date.now() > current.resetAt) {
    current.hits = 0;
    current.resetAt = Date.now() + 1000;
  }
  current.hits += 1;
  counters.set(key, current);

  let role: string | undefined;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const token = auth.replace("Bearer ", "");
      const decoded = jwt.decode(token) as { role?: string } | null;
      role = decoded?.role;
    } catch {
      role = undefined;
    }
  }

  if (await isTemporaryBlocked(ip)) {
    return { action: "BLOCK", reason: "temporarily quarantined", riskScore: 95 };
  }

  const anomaly = isAnomalousTraffic(ip, current.hits);
  trackTraffic(ip, current.hits);
  const threatIntel = await getIpThreatIntel(ip);

  const score = calculateRisk({
    ip,
    endpoint: req.path,
    failedAttempts: current.failed,
    requestRps: current.hits,
    isIpReputedBad: badIps.has(ip),
    endpointSensitivity: endpointSensitivity(req.path),
    externalThreatScore: threatIntel.score
  });

  const rules = await getRules(app, env);
  const matchedRule = rules.find((rule) => matchRule(rule, req, role));

  if (anomaly || score >= 90) {
    await addTemporaryBlock(ip);
    return { action: "BLOCK", reason: "high-risk anomaly detected", riskScore: Math.max(90, score) };
  }

  if (matchedRule) {
    if (matchedRule.action === "BLOCK") {
      current.failed += 1;
      return { action: "BLOCK", reason: `rule:${matchedRule.name}`, riskScore: Math.max(80, score), ruleId: matchedRule.id };
    }
    if (matchedRule.action === "RATE_LIMIT" && current.hits > (matchedRule.maxRps ?? 5)) {
      return { action: "RATE_LIMIT", reason: `rate-limited by ${matchedRule.name}`, riskScore: Math.max(55, score), ruleId: matchedRule.id };
    }
  }

  if (score >= 65) {
    return {
      action: "RATE_LIMIT",
      reason: `medium risk (threat-intel=${threatIntel.score}, source=${threatIntel.source})`,
      riskScore: score
    };
  }

  return {
    action: "ALLOW",
    reason: `passed checks (threat-intel=${threatIntel.score}, source=${threatIntel.source})`,
    riskScore: score
  };
};

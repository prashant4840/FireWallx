import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { createAlertIfNeeded } from "../core/alerting.js";
import { getGeoForIp } from "../core/geoIpService.js";
import { startRealTrafficSimulation, stopRealTrafficSimulation } from "../core/realTrafficSimulation.js";

const ruleSchema = z.object({
  name: z.string().min(3),
  application: z.string(),
  environment: z.string(),
  priority: z.number().int().min(1).max(1000),
  enabled: z.boolean().default(true),
  action: z.enum(["ALLOW", "BLOCK", "RATE_LIMIT"]),
  ipCidr: z.string().optional(),
  domainPattern: z.string().optional(),
  port: z.number().int().optional(),
  protocol: z.string().optional(),
  pathPattern: z.string().optional(),
  role: z.string().optional(),
  maxRps: z.number().int().optional(),
  metadata: z.record(z.any()).optional()
});

export const createRoutes = (publish: (event: string, payload: unknown) => void) => {
  const router = Router();
  const seedDemoState = async () => {
    await prisma.rule.deleteMany({ where: { application: "default-app", environment: "prod" } });
    await prisma.alert.deleteMany();
    await prisma.trafficLog.deleteMany();

    await prisma.rule.createMany({
      data: [
        { name: "Allow Public Endpoints", application: "default-app", environment: "prod", priority: 10, enabled: true, action: "ALLOW", pathPattern: "/public" },
        // Admin requests are allowed by policy; non-admins will still be blocked by gateway RBAC.
        { name: "Allow Admin", application: "default-app", environment: "prod", priority: 20, enabled: true, action: "ALLOW", pathPattern: "/admin", role: "admin" },
        { name: "Rate Limit Auth Bursts", application: "default-app", environment: "prod", priority: 30, enabled: true, action: "RATE_LIMIT", pathPattern: "/auth", maxRps: 5 }
      ]
    });

    await prisma.alert.createMany({
      data: [
        { level: "LOW", type: "INFO_TRAFFIC", message: "Demo reset complete. Baseline telemetry restored.", application: "default-app", metadata: { reset: true } },
        { level: "CRITICAL", type: "ADMIN_ABUSE", message: "Repeated unauthorized /admin access blocked", application: "default-app", sourceIp: "196.44.21.87", metadata: { endpoint: "/admin" } }
      ]
    });
  };

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "control-plane" });
  });

  router.get("/rules", async (req, res) => {
    const application = String(req.query.application ?? "default-app");
    const environment = String(req.query.environment ?? "prod");

    const rules = await prisma.rule.findMany({
      where: { application, environment },
      orderBy: { priority: "asc" }
    });

    res.json(rules);
  });

  router.post("/rules", async (req, res) => {
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const created = await prisma.rule.create({ data: parsed.data });
    publish("rule.created", created);
    return res.status(201).json(created);
  });

  router.put("/rules/:id", async (req, res) => {
    const parsed = ruleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const updated = await prisma.rule.update({
      where: { id: req.params.id },
      data: parsed.data
    });

    publish("rule.updated", updated);
    return res.json(updated);
  });

  router.delete("/rules/:id", async (req, res) => {
    await prisma.rule.delete({ where: { id: req.params.id } });
    publish("rule.deleted", { id: req.params.id });
    return res.status(204).send();
  });

  router.post("/ingest/decision", async (req, res) => {
    const log = await prisma.trafficLog.create({ data: req.body });

    if (log.riskScore >= 80 || log.action === "BLOCK") {
      const alert = await createAlertIfNeeded({
        level: log.riskScore >= 90 ? "CRITICAL" : "MEDIUM",
        type: "THREAT_DECISION",
        message: `Action=${log.action} risk=${log.riskScore} endpoint=${log.endpoint}`,
        sourceIp: log.ip,
        application: log.application,
        metadata: { endpoint: log.endpoint, reason: log.reason }
      });
      if (alert) publish("alert.created", alert);
    }

    publish("traffic.new", log);
    return res.status(202).json({ accepted: true });
  });

  router.get("/logs", async (req, res) => {
    const action = req.query.action ? String(req.query.action) : undefined;
    const ip = req.query.ip ? String(req.query.ip) : undefined;
    const limit = Number(req.query.limit ?? 100);

    const logs = await prisma.trafficLog.findMany({
      where: {
        action: action as "ALLOW" | "BLOCK" | "RATE_LIMIT" | undefined,
        ip: ip
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500)
    });

    res.json(logs);
  });

  router.get("/alerts", async (_req, res) => {
    const alerts = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    res.json(alerts);
  });

  router.get("/demo/tokens", async (_req, res) => {
    const jwt = await import("jsonwebtoken");
    const secret = process.env.JWT_SECRET ?? "demo-super-secret";
    const adminToken = jwt.default.sign({ sub: "demo-admin", role: "admin" }, secret, { expiresIn: "7d" });
    const userToken = jwt.default.sign({ sub: "demo-user", role: "user" }, secret, { expiresIn: "7d" });
    res.json({ adminToken, userToken });
  });

  router.post("/demo/reset", async (_req, res) => {
    stopRealTrafficSimulation();
    await seedDemoState();
    publish("demo.reset", { ok: true, at: new Date().toISOString() });
    publish("simulation.completed", { mode: "DDoS", durationSec: 0, endedAt: new Date().toISOString(), reset: true });
    return res.json({ ok: true, message: "Demo reset successfully" });
  });

  router.get("/analytics/overview", async (_req, res) => {
    const [allowed, blocked, rateLimited, totalAlerts] = await Promise.all([
      prisma.trafficLog.count({ where: { action: "ALLOW" } }),
      prisma.trafficLog.count({ where: { action: "BLOCK" } }),
      prisma.trafficLog.count({ where: { action: "RATE_LIMIT" } }),
      prisma.alert.count({ where: { isResolved: false } })
    ]);

    res.json({ allowed, blocked, rateLimited, totalAlerts });
  });

  router.get("/analytics/heatmap", async (_req, res) => {
    const blockedLogs: Array<{ id: string; ip: string; riskScore: number; createdAt: Date }> = await prisma.trafficLog.findMany({
      where: { action: "BLOCK" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, ip: true, riskScore: true, createdAt: true }
    });

    const points = await Promise.all(
      blockedLogs.map(async (log) => {
        const geo = await getGeoForIp(log.ip);
        return {
          id: log.id,
          ip: log.ip,
          riskScore: log.riskScore,
          lat: geo.lat,
          lon: geo.lon,
          country: geo.country,
          createdAt: log.createdAt
        };
      })
    );

    res.json(points);
  });

  router.get("/analytics/timeline", async (_req, res) => {
    const logs: Array<{ createdAt: Date; action: "ALLOW" | "BLOCK" | "RATE_LIMIT"; ip: string; riskScore: number; reason: string | null }> = await prisma.trafficLog.findMany({
      where: { endpoint: "/admin" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { createdAt: true, action: true, ip: true, riskScore: true, reason: true }
    });

    const events = logs.map((log) => ({
      at: log.createdAt,
      label: `${log.action} ${log.ip}`,
      detail: `risk=${log.riskScore} ${log.reason ?? ""}`.trim(),
      severity: log.action === "BLOCK" ? "CRITICAL" : log.action === "RATE_LIMIT" ? "MEDIUM" : "LOW"
    }));

    res.json(events);
  });

  router.post("/simulate/attack", async (req, res) => {
    const mode = String(req.body.mode ?? "DDoS");
    const result = startRealTrafficSimulation(publish, {
      mode,
      durationSec: Number(req.body.durationSec ?? 20),
      rps: Number(req.body.rps ?? 80),
      application: String(req.body.application ?? "default-app"),
      environment: String(req.body.environment ?? "prod")
    });
    res.json(result);
  });

  return router;
};

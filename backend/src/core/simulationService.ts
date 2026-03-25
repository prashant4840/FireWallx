import { prisma } from "../db/prisma.js";

type PublishFn = (event: string, payload: unknown) => void;

let activeInterval: NodeJS.Timeout | null = null;

const randomIp = () => {
  const octet = () => Math.floor(Math.random() * 255);
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
};

export const startAttackSimulation = (
  publish: PublishFn,
  options: { mode: string; durationSec?: number; rps?: number; application?: string; environment?: string }
) => {
  if (activeInterval) {
    clearInterval(activeInterval);
  }

  const durationSec = Math.max(5, Number(options.durationSec ?? 12));
  const rps = Math.max(30, Number(options.rps ?? 120));
  const startedAt = Date.now();
  const app = options.application ?? "default-app";
  const env = options.environment ?? "prod";

  publish("simulation.started", { mode: options.mode, rps, durationSec, startedAt: new Date(startedAt).toISOString() });

  activeInterval = setInterval(async () => {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed >= durationSec) {
      if (activeInterval) clearInterval(activeInterval);
      activeInterval = null;
      publish("simulation.completed", { mode: options.mode, durationSec, endedAt: new Date().toISOString() });
      return;
    }

    const burst = Array.from({ length: Math.min(70, Math.max(20, Math.round(rps / 2))) }).map(async (_unused, idx) => {
      // Keep risk spread wide so the UI shows ALLOW/BLOCK/RATE_LIMIT distribution.
      // (Previous logic always produced >= 68, which made ALLOW always 0.)
      const dynamicRisk = Math.min(99, 40 + Math.round(elapsed * 7) + (idx % 25));
      const action = dynamicRisk > 82 ? "BLOCK" : dynamicRisk > 65 ? "RATE_LIMIT" : "ALLOW";
      const ip = randomIp();

      const log = await prisma.trafficLog.create({
        data: {
          requestId: `sim-${Date.now()}-${idx}`,
          application: app,
          environment: env,
          ip,
          method: "GET",
          endpoint: "/admin",
          protocol: "HTTP",
          domain: "simulator.local",
          port: 8080,
          headers: { "x-simulated": "true", mode: options.mode },
          action,
          riskScore: dynamicRisk,
          userRole: null,
          statusCode: action === "BLOCK" ? 403 : action === "RATE_LIMIT" ? 429 : 200,
          reason: `simulated ${options.mode} traffic`,
          responseMs: Math.max(5, 80 - Math.round(elapsed * 2))
        }
      });

      publish("traffic.new", log);
      if (action === "BLOCK") {
        publish("simulation.quarantine", { ip, risk: dynamicRisk, at: new Date().toISOString() });
      }
    });

    await Promise.all(burst);
    publish("simulation.tick", {
      mode: options.mode,
      elapsedSec: Math.round(elapsed),
      emittedRps: rps,
      riskEstimate: Math.min(99, 45 + Math.round(elapsed * 4))
    });
  }, 1000);

  return { started: true, mode: options.mode, durationSec, rps };
};

export const stopAttackSimulation = () => {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
};

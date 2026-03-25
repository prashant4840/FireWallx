import jwt from "jsonwebtoken";

type PublishFn = (event: string, payload: unknown) => void;

type RealTrafficOptions = {
  mode: string;
  durationSec?: number;
  rps?: number;
  application?: string;
  environment?: string;
};

let activeController: AbortController | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const randomIp = () => {
  const octet = () => Math.floor(Math.random() * 255);
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
};

const signToken = (role: "admin" | "user") => {
  const secret = process.env.JWT_SECRET ?? "demo-super-secret";
  // Sub/role values align with your gateway demo tokens.
  const sub = role === "admin" ? "demo-admin" : "demo-user";
  return jwt.sign({ sub, role }, secret, { expiresIn: "7d" });
};

const pickPath = (): "/public" | "/admin" | "/auth/login" | "/payments" => {
  const r = Math.random();
  if (r < 0.45) return "/public";
  if (r < 0.62) return "/auth/login";
  if (r < 0.74) return "/payments";
  return "/admin";
};

const getAuthForPath = (path: string) => {
  // For auth-protected endpoints (gateway checks only token presence for /auth),
  // we vary role to trigger RBAC denies vs allowed traffic.
  if (path === "/admin" || path === "/payments" || path === "/auth/login" || path === "/internal") {
    const role = Math.random() < 0.35 ? ("admin" as const) : ("user" as const);
    return `Bearer ${signToken(role)}`;
  }
  return undefined;
};

export const startRealTrafficSimulation = (
  publish: PublishFn,
  options: RealTrafficOptions
) => {
  stopRealTrafficSimulation();

  const durationSec = Math.max(5, Number(options.durationSec ?? 20));
  const rps = Math.max(10, Number(options.rps ?? 80));
  const app = options.application ?? "default-app";
  const env = options.environment ?? "prod";

  const gatewayBaseUrl = process.env.GATEWAY_URL ?? "http://localhost:8080";

  const controller = new AbortController();
  activeController = controller;

  const startedAt = Date.now();
  publish("simulation.started", {
    mode: options.mode,
    rps,
    durationSec,
    startedAt: new Date(startedAt).toISOString()
  });

  // Scheduler: send a small batch every 200ms to approximate RPS.
  const batchEveryMs = 200;
  const batchSize = Math.max(1, Math.round((rps * batchEveryMs) / 1000));

  const endAt = Date.now() + durationSec * 1000;
  // Run the loop in the background so the API responds immediately.
  void (async () => {
    while (Date.now() < endAt && !controller.signal.aborted) {
      const batch = Array.from({ length: batchSize }).map(async (_unused, idx) => {
        const path = pickPath();
        const ip =
          // Keep rate-limited traffic from clustering across too many IPs.
          // This makes your in-gateway + redis rate limiting easier to demonstrate.
          path === "/auth/login" ? "203.0.113.10" : randomIp();

        const auth = getAuthForPath(path);

        await fetch(`${gatewayBaseUrl}${path}`, {
          signal: controller.signal,
          method: "GET",
          headers: {
            "x-app-name": app,
            "x-env": env,
            "x-forwarded-for": ip,
            ...(auth ? { Authorization: auth } : {})
          }
        }).catch(() => undefined);

        // Optionally could track emitted responses; the SOC reads truth from DB logs.
        void idx;
      });

      await Promise.allSettled(batch);
      publish("simulation.tick", {
        mode: options.mode,
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        emittedRps: rps,
        riskEstimate: Math.min(99, 35 + Math.round(Math.random() * 40))
      });

      await sleep(batchEveryMs);
    }

    publish("simulation.completed", {
      mode: options.mode,
      durationSec,
      endedAt: new Date().toISOString()
    });
  })();

  return { started: true, mode: options.mode, durationSec, rps };
};

export const stopRealTrafficSimulation = () => {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
};


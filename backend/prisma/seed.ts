import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const randomIp = () => `${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

const makeLog = (idx: number, action: "ALLOW" | "BLOCK" | "RATE_LIMIT", endpoint: string, riskScore: number, app: string) => ({
  requestId: `seed-${Date.now()}-${idx}`,
  application: app,
  environment: "prod",
  ip: randomIp(),
  method: idx % 4 === 0 ? "POST" : "GET",
  endpoint,
  protocol: "HTTP",
  domain: `${app}.demo.local`,
  port: 8080,
  headers: { "x-demo": "true" },
  action,
  riskScore,
  userRole: action === "ALLOW" ? "user" : null,
  statusCode: action === "BLOCK" ? 403 : action === "RATE_LIMIT" ? 429 : 200,
  reason: `demo seeded ${action.toLowerCase()} decision`,
  responseMs: Math.max(10, 120 - riskScore)
});

const run = async () => {
  const jwtSecret = process.env.JWT_SECRET ?? "demo-super-secret";

  await prisma.alert.deleteMany();
  await prisma.trafficLog.deleteMany();
  await prisma.rule.deleteMany();

  await prisma.rule.createMany({
    data: [
      { name: "Allow public app1", application: "app1", environment: "prod", priority: 10, enabled: true, action: "ALLOW", pathPattern: "/public" },
      { name: "Block admin non-admin", application: "app1", environment: "prod", priority: 20, enabled: true, action: "BLOCK", pathPattern: "/admin", role: "admin" },
      { name: "Rate limit login burst app1", application: "app1", environment: "prod", priority: 30, enabled: true, action: "RATE_LIMIT", pathPattern: "/auth", maxRps: 3 },
      { name: "Allow public app2", application: "app2", environment: "prod", priority: 10, enabled: true, action: "ALLOW", pathPattern: "/public" },
      { name: "Block sensitive payments app2", application: "app2", environment: "prod", priority: 20, enabled: true, action: "BLOCK", pathPattern: "/payments" },
      { name: "Fast rate-limit app2", application: "app2", environment: "prod", priority: 30, enabled: true, action: "RATE_LIMIT", pathPattern: "/api", maxRps: 2 }
    ]
  });

  const logs = [
    ...Array.from({ length: 20 }).map((_, idx) => makeLog(idx, "ALLOW", "/public", 20 + (idx % 20), "app1")),
    ...Array.from({ length: 16 }).map((_, idx) => makeLog(idx + 20, "RATE_LIMIT", "/auth/login", 62 + (idx % 15), "app1")),
    ...Array.from({ length: 18 }).map((_, idx) => makeLog(idx + 40, "BLOCK", "/admin", 80 + (idx % 19), "app2"))
  ];

  for (const log of logs) {
    await prisma.trafficLog.create({ data: log });
  }

  await prisma.alert.createMany({
    data: [
      { level: "LOW", type: "INFO_TRAFFIC", message: "Normal traffic baseline established", application: "app1", metadata: { sample: true } },
      { level: "MEDIUM", type: "RATE_LIMIT_SPIKE", message: "Brute-force pattern detected on /auth/login", application: "app1", sourceIp: "73.201.19.20", metadata: { endpoint: "/auth/login" } },
      { level: "CRITICAL", type: "ADMIN_ABUSE", message: "Repeated unauthorized /admin access blocked", application: "app2", sourceIp: "196.44.21.87", metadata: { endpoint: "/admin" } }
    ]
  });

  const adminToken = jwt.sign({ sub: "demo-admin", role: "admin" }, jwtSecret, { expiresIn: "7d" });
  const userToken = jwt.sign({ sub: "demo-user", role: "user" }, jwtSecret, { expiresIn: "7d" });

  console.log("\nDemo seed complete. Use these JWTs:");
  console.log(`DEMO_ADMIN_TOKEN=${adminToken}`);
  console.log(`DEMO_USER_TOKEN=${userToken}`);
  console.log("Suggested demo thresholds: GLOBAL_RPS_LIMIT=20, GLOBAL_RPS_WINDOW_SEC=1\n");
};

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

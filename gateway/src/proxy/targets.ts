export const targets: Record<string, string> = {
  app1: process.env.APP1_URL ?? "http://localhost:7001",
  app2: process.env.APP2_URL ?? "http://localhost:7002",
  default: process.env.DEFAULT_APP_URL ?? "http://localhost:7001"
};

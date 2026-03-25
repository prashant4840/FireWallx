import type { FirewallRule } from "../types/firewall.js";

let cache: FirewallRule[] = [];
let lastSync = 0;

export const getRules = async (application: string, environment: string): Promise<FirewallRule[]> => {
  const now = Date.now();
  if (now - lastSync < 3000 && cache.length > 0) {
    return cache;
  }

  const baseUrl = process.env.CONTROL_PLANE_URL ?? "http://localhost:5001";
  const response = await fetch(
    `${baseUrl}/api/rules?application=${encodeURIComponent(application)}&environment=${encodeURIComponent(environment)}`
  );

  if (!response.ok) return cache;

  cache = (await response.json()) as FirewallRule[];
  lastSync = now;
  return cache;
};

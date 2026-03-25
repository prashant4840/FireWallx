export type Action = "ALLOW" | "BLOCK" | "RATE_LIMIT";

export interface FirewallRule {
  id: string;
  name: string;
  application: string;
  environment: string;
  priority: number;
  enabled: boolean;
  action: Action;
  ipCidr?: string | null;
  domainPattern?: string | null;
  port?: number | null;
  protocol?: string | null;
  pathPattern?: string | null;
  role?: string | null;
  maxRps?: number | null;
}

export interface Decision {
  action: Action;
  reason: string;
  riskScore: number;
  ruleId?: string;
}

export type FirewallAction = "ALLOW" | "BLOCK" | "RATE_LIMIT";

export interface RuleDto {
  id: string;
  name: string;
  application: string;
  environment: string;
  priority: number;
  enabled: boolean;
  action: FirewallAction;
  ipCidr?: string | null;
  domainPattern?: string | null;
  port?: number | null;
  protocol?: string | null;
  pathPattern?: string | null;
  role?: string | null;
  maxRps?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface LogEntry {
  id: string;
  ip: string;
  endpoint: string;
  action: "ALLOW" | "BLOCK" | "RATE_LIMIT";
  riskScore: number;
  method: string;
  createdAt: string;
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  action: "ALLOW" | "BLOCK" | "RATE_LIMIT";
  application: string;
  environment: string;
  enabled: boolean;
}

export interface HeatPoint {
  id: string;
  ip: string;
  riskScore: number;
  lat: number;
  lon: number;
  country: string;
  createdAt: string;
}

export interface TimelineEvent {
  at: string;
  label: string;
  detail: string;
  severity: "LOW" | "MEDIUM" | "CRITICAL";
}

export interface AlertEntry {
  id: string;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  application: string;
  createdAt: string;
}

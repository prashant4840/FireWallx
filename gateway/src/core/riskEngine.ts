interface RiskInput {
  ip: string;
  endpoint: string;
  failedAttempts: number;
  requestRps: number;
  isIpReputedBad: boolean;
  endpointSensitivity: number;
  externalThreatScore: number;
}

export const calculateRisk = (input: RiskInput): number => {
  let score = 0;

  if (input.isIpReputedBad) score += 35;
  score += Math.min(input.requestRps * 5, 25);
  score += Math.min(input.failedAttempts * 4, 20);
  score += Math.min(input.endpointSensitivity * 2, 20);
  score += Math.min(Math.round(input.externalThreatScore * 0.35), 35);

  return Math.max(0, Math.min(100, Math.round(score)));
};

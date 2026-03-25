interface ThreatIntelResult {
  score: number;
  source: "abuseipdb" | "fallback";
  countryCode?: string;
  usageType?: string;
}

const cache = new Map<string, { value: ThreatIntelResult; expiresAt: number }>();
const ttlMs = Number(process.env.THREAT_INTEL_CACHE_MS ?? 15 * 60 * 1000);

export const getIpThreatIntel = async (ip: string): Promise<ThreatIntelResult> => {
  if (!ip || ip.startsWith("127.") || ip === "::1") {
    return { score: 0, source: "fallback" };
  }

  const existing = cache.get(ip);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.value;
  }

  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) {
    const fallback = { score: 0, source: "fallback" as const };
    cache.set(ip, { value: fallback, expiresAt: Date.now() + ttlMs });
    return fallback;
  }

  try {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
    const response = await fetch(url, {
      headers: {
        Key: apiKey,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`abuseipdb ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: { abuseConfidenceScore?: number; countryCode?: string; usageType?: string };
    };

    const result: ThreatIntelResult = {
      score: Math.max(0, Math.min(100, Math.round(payload.data?.abuseConfidenceScore ?? 0))),
      source: "abuseipdb",
      countryCode: payload.data?.countryCode,
      usageType: payload.data?.usageType
    };

    cache.set(ip, { value: result, expiresAt: Date.now() + ttlMs });
    return result;
  } catch {
    const fallback = { score: 0, source: "fallback" as const };
    cache.set(ip, { value: fallback, expiresAt: Date.now() + 30_000 });
    return fallback;
  }
};

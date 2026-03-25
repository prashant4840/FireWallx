interface GeoPoint {
  lat: number;
  lon: number;
  country: string;
}

const cache = new Map<string, { value: GeoPoint; expiresAt: number }>();

export const getGeoForIp = async (ip: string): Promise<GeoPoint> => {
  const existing = cache.get(ip);
  if (existing && existing.expiresAt > Date.now()) return existing.value;

  if (!ip || ip.startsWith("127.") || ip === "::1") {
    return { lat: 37.7749, lon: -122.4194, country: "LOCAL" };
  }

  // ip-api can be slow/unreachable in some environments; hard-timeout so it can't block heatmap/timeline.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,lat,lon`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = (await response.json()) as { status?: string; country?: string; lat?: number; lon?: number };
    if (data.status === "success" && typeof data.lat === "number" && typeof data.lon === "number") {
      const value = { lat: data.lat, lon: data.lon, country: data.country ?? "UNK" };
      cache.set(ip, { value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      return value;
    }
  } catch {
    // ignore and fallback below
  }

  return { lat: 0, lon: 0, country: "UNK" };
};

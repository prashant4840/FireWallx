const history = new Map<string, number[]>();

export const trackTraffic = (key: string, count: number) => {
  const values = history.get(key) ?? [];
  values.push(count);
  if (values.length > 60) values.shift();
  history.set(key, values);
};

export const isAnomalousTraffic = (key: string, value: number): boolean => {
  const values = history.get(key) ?? [];
  if (values.length < 10) return false;

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, item) => acc + (item - avg) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return value > avg + 3 * stdDev;
};

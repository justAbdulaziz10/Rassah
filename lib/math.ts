// Small numeric helpers shared by the engine, the monitoring code and the scripts.
// Client-safe and free of server-only imports, so scripts can use them directly.

/** Round to 2 decimal places (cm, g, kg, SAR). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Nearest-rank percentile: the smallest value with at least p% of samples at or below it. null when empty. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

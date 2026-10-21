// Plausibility limits for product facts, shared by AI extraction (out-of-range values become unknown)
// and manual measurements (out-of-range input is rejected). Client-safe.

export const LIMITS = {
  /** Longest side of any single product, in cm. */
  maxSideCm: 150,
  /** Heaviest single product, in grams. */
  maxWeightG: 30_000,
} as const;

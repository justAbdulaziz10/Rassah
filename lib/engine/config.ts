// Engine constants. Each value has a documented justification in docs/stack/03 and docs/decisions.md.

export const ENGINE_CONFIG = {
  /** Safety margin on inferred dimensions. Set from the extraction eval error (docs/stack/07). */
  marginInferred: 0.15,
  /** Protective padding per side for fragile/sensitive items (typical bubble-wrap thickness). */
  paddingCm: 1.5,
  /** Minimum share of an item's base that must rest on the floor or on items below. Assumption. */
  minSupport: 0.7,
  /** Search time budget per order. */
  maxSearchMs: 1500,
  /** Seeded random orderings tried per carton after the 7 fixed strategies fail. */
  restarts: 40,
  /** Carton wall thickness used to derive outer dimensions for volumetric weight. */
  wallCm: 0.5,
  /** Max units per order (input cap). */
  maxUnits: 12,
  /** Numeric tolerance for geometric comparisons. */
  eps: 1e-6,
} as const;

export type EngineConfig = {
  marginInferred: number;
  paddingCm: number;
  minSupport: number;
  maxSearchMs: number;
  restarts: number;
  wallCm: number;
  maxUnits: number;
  eps: number;
};

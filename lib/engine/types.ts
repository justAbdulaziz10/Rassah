// Core engine types. Units: centimetres and grams. Coordinates: z is up (gravity points to -z).

export type DataSource = "page" | "inferred" | "manual" | "unknown";
export type Confidence = "high" | "medium" | "low";

/** Shipping facts for one product, as produced by the AI extractor or a manual measurement. */
export interface ProductFacts {
  productId: string;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightG: number | null;
  dimsSource: DataSource;
  weightSource: DataSource;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
  confidence: Confidence | null;
}

export interface OrderLine {
  productId: string;
  name: string;
  qty: number;
}

/** One physical unit to place (an order line with qty 2 becomes two units). */
export interface Unit {
  unitId: string; // e.g. "p-07#1"
  productId: string;
  name: string;
  /** Effective size after safety margin and padding, sorted L >= W >= H. */
  dims: [number, number, number];
  /** Size before margin/padding (what the AI or packer reported), sorted L >= W >= H. */
  baseDims: [number, number, number];
  weightG: number;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
  estimated: boolean; // dims came from inference, so the margin was applied
  /** For liquids: the vertical size that must stay vertical (the original height). */
  uprightHeight: number | null;
}

export interface Carton {
  id: string;
  name: string;
  inner: [number, number, number]; // L, W, H (inner dimensions, cm)
  maxWeightG: number;
  tareG: number;
  costSar: number;
}

export interface Placement {
  unitId: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export type ViolationCode =
  | "out_of_bounds"
  | "overlap"
  | "overweight"
  | "floating"
  | "on_fragile"
  | "liquid_tipped"
  | "dim_mismatch"
  | "missing_item"
  | "duplicate_item";

export interface Violation {
  code: ViolationCode;
  unitId: string | null;
  detail: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

// not_needed: not searched further because a cheaper carton already holds the order.
type SkipReason = "oversize" | "overweight" | "search_budget" | "no_layout" | "validator_rejected" | "not_needed";

export interface CartonAttempt {
  cartonId: string;
  outcome: "packed" | SkipReason;
  strategy: string | null;
}

export interface CostEstimate {
  cartonSar: number;
  outerCm: [number, number, number];
  actualKg: number;
  volumetricKg: number;
  chargeableKg: number;
  shippingSar: number;
  totalSar: number;
  estimated: true;
}

export interface ShippingRates {
  baseSar: number; // covers the first kg
  perKgSar: number; // each additional started kg
  volumetricDivisor: number; // cm^3 per kg
}

export interface PackSuccess {
  status: "box_found";
  carton: Carton;
  placements: Placement[];
  units: Unit[];
  strategy: string;
  cost: CostEstimate;
  attempts: CartonAttempt[];
  candidatesChecked: number;
  validatorRejections: number;
  violations: Array<Violation & { cartonId: string }>;
  searchMs: number;
}

export interface PackNoBox {
  status: "no_box";
  reason: string;
  attempts: CartonAttempt[];
  candidatesChecked: number;
  validatorRejections: number;
  violations: Array<Violation & { cartonId: string }>;
  searchMs: number;
}

interface PackNeedsMeasurement {
  status: "needs_measurement";
  productIds: string[];
}

export type PackResult = PackSuccess | PackNoBox | PackNeedsMeasurement;

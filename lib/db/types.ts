import "server-only";
// Domain types for persisted data. The Repo interface speaks these (camelCase);
// the Supabase adapter maps them to snake_case columns.

import type { CartonAttempt, Confidence, DataSource, ProductFacts, ViolationCode } from "@/lib/engine/types";

export interface Product {
  id: string;
  name: string;
  description: string;
  url: string | null;
  category: string | null;
  sourceHash: string;
}

/**
 * Orders placed in the built-in store (/store) live in the same `orders` table as the seeded ones.
 * No schema change: `demo` = "store" marks them and `expect` holds the customer's name.
 * Their numbers start at 5001 so they never collide with the seeded orders (1001–1020).
 */
export const STORE_ORDER_TAG = "store";
export const STORE_FIRST_ORDER_ID = 5001;

export interface OrderSummary {
  id: string;
  demo: string | null;
  expect: string | null;
  /** Set for orders placed in the built-in store. */
  customerName: string | null;
  createdAt: string | null;
  lineCount: number;
  unitCount: number;
  /** Distinct products in the order. */
  productIds: string[];
}

export interface OrderWithLines {
  id: string;
  demo: string | null;
  customerName: string | null;
  lines: Array<{ productId: string; qty: number }>;
}

/**
 * Where stored facts came from. "seeded" = pre-loaded from data/ground_truth.json for the offline
 * demo (DATA_BACKEND=memory only; never written to Supabase, never counted as AI output).
 */
export type FactsOrigin = "ai" | "manual" | "ai_corrected" | "seeded";

export interface StoredFacts extends ProductFacts {
  evidence: string | null;
  origin: FactsOrigin;
  sourceHash: string;
  model: string | null;
  promptVersion: string | null;
  extractedAt: string | null;
  updatedAt: string;
}

export type ExtractionStatus =
  | "ok"
  | "parse_error"
  | "api_error"
  | "rate_limited"
  | "timeout"
  | "blocked"
  | "empty"
  | "config_error"
  | "simulated_outage";

export type Trigger = "order" | "admin" | "eval";

export interface ExtractionEvent {
  id?: string;
  createdAt?: string;
  runId: string | null;
  trigger: Trigger;
  productId: string;
  status: ExtractionStatus;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  model: string | null;
  promptVersion: string;
  dimsSource: DataSource | null;
  weightSource: DataSource | null;
  confidence: Confidence | null;
  fragile: boolean | null;
  liquid: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type RunStatus = "box_found" | "no_box" | "needs_measurement" | "error";
export type EmployeeAction = "pending" | "confirmed" | "edited";

export interface OrderRun {
  id: string;
  createdAt?: string;
  trigger: "order" | "eval";
  orderId: string;
  status: RunStatus;
  cartonId: string | null;
  strategy: string | null;
  itemsCount: number;
  cacheHits: number;
  cacheMisses: number;
  estimatedUnits: number;
  unitSources: Record<DataSource, number>;
  /** Products whose facts were AI-extracted (origin "ai") when this order was packed. */
  aiProducts: string[];
  extractMs: number;
  packMs: number;
  totalMs: number;
  candidatesChecked: number;
  attempts: CartonAttempt[];
  validatorRejections: number;
  violations: Array<{ code: ViolationCode; unitId: string | null; cartonId: string; detail: string }>;
  cartonCostSar: number | null;
  shippingSar: number | null;
  totalSar: number | null;
  tokensTotal: number;
  costUsd: number;
  engineVersion: string;
  promptVersion: string;
  monitoringDegraded: boolean;
  errorCode: string | null;
  employeeAction: EmployeeAction;
  actionAt: string | null;
}

export interface Correction {
  id?: string;
  createdAt?: string;
  runId: string | null;
  productId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  priorOrigin: FactsOrigin | "none";
}

export type Severity = "info" | "warning" | "critical";

export interface Alert {
  id?: string;
  createdAt?: string;
  rule: string;
  severity: Severity;
  value: number;
  threshold: number;
  sampleSize: number;
  message: string;
  simulated: boolean;
  resolvedAt: string | null;
}

export interface EvalRun {
  id?: string;
  createdAt?: string;
  kind: "extraction" | "packing";
  model: string | null;
  promptVersion: string | null;
  engineVersion: string | null;
  summary: Record<string, unknown>;
}

export interface EvalResult {
  caseId: string;
  passed: boolean | null;
  details: Record<string, unknown>;
}

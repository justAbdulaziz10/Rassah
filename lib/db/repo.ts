import "server-only";
// The data-access interface the app depends on. Two implementations:
// - lib/db/supabase.ts (production)
// - tests/fakes/memory-repo.ts (unit tests; no network)

import type { Carton, ShippingRates } from "@/lib/engine/types";
import type {
  Alert,
  Correction,
  EmployeeAction,
  EvalResult,
  EvalRun,
  ExtractionEvent,
  OrderRun,
  OrderSummary,
  OrderWithLines,
  Product,
  StoredFacts,
} from "./types";

export interface Repo {
  ping(): Promise<void>;

  // Mock store
  listOrders(): Promise<OrderSummary[]>;
  getOrder(orderId: string): Promise<OrderWithLines | null>;
  listProducts(): Promise<Product[]>;
  getProducts(ids: string[]): Promise<Product[]>;
  listCartons(): Promise<Carton[]>;
  getShippingRates(): Promise<ShippingRates>;

  // Catalog cache
  getFacts(ids: string[]): Promise<Map<string, StoredFacts>>;
  listFacts(): Promise<StoredFacts[]>;
  upsertFacts(facts: StoredFacts): Promise<void>;
  deleteFacts(productId: string | "all"): Promise<void>;

  // Monitoring events
  insertExtractionEvents(events: ExtractionEvent[]): Promise<void>;
  insertOrderRun(run: OrderRun): Promise<void>;
  getOrderRun(runId: string): Promise<OrderRun | null>;
  setOrderRunAction(runId: string, action: EmployeeAction): Promise<void>;
  insertCorrections(rows: Correction[]): Promise<void>;
  listExtractionEvents(sinceIso: string | null): Promise<ExtractionEvent[]>;
  listOrderRuns(sinceIso: string | null): Promise<OrderRun[]>;
  listCorrections(sinceIso: string | null): Promise<Correction[]>;
  getRunTrace(runId: string): Promise<{ run: OrderRun | null; extractions: ExtractionEvent[]; corrections: Correction[] }>;

  // Alerts
  listOpenAlerts(): Promise<Alert[]>;
  insertAlert(alert: Alert): Promise<void>;
  resolveAlert(id: string): Promise<void>;

  // Offline evaluation
  insertEvalRun(run: EvalRun, results: EvalResult[]): Promise<string>;
  latestEvalRuns(kind: EvalRun["kind"], limit: number): Promise<EvalRun[]>;
  getEvalResults(evalRunId: string): Promise<EvalResult[]>;
}

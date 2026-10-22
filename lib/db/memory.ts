import "server-only";
// In-memory Repo. Used by unit tests, and by local development / offline demo fallback when
// DATA_BACKEND=memory (seeded from data/*.json). Not for production: data lives in one process.

import { randomUUID } from "node:crypto";
import type { Repo } from "@/lib/db/repo";
import type {
  Alert,
  Correction,
  EmployeeAction,
  EvalResult,
  EvalRun,
  ExtractionEvent,
  OrderRun,
  Product,
  StoredFacts,
} from "@/lib/db/types";
import { STORE_FIRST_ORDER_ID, STORE_ORDER_TAG } from "@/lib/db/types";
import type { Carton, ShippingRates } from "@/lib/engine/types";

const customerOf = (o: { demo: string | null; expect: string | null }) => (o.demo === STORE_ORDER_TAG ? o.expect : null);

export class MemoryRepo implements Repo {
  products = new Map<string, Product>();
  cartons: Carton[] = [];
  rates: ShippingRates = { baseSar: 18, perKgSar: 3, volumetricDivisor: 5000 };
  orders = new Map<
    string,
    { id: string; demo: string | null; expect: string | null; createdAt?: string; lines: Array<{ productId: string; qty: number }> }
  >();
  facts = new Map<string, StoredFacts>();
  extractionEvents: ExtractionEvent[] = [];
  orderRuns: OrderRun[] = [];
  corrections: Correction[] = [];
  alerts: Alert[] = [];
  evalRuns: Array<EvalRun & { results: EvalResult[] }> = [];
  /** Set to make every write throw (simulates Supabase being down). */
  failWrites = false;
  /** Tests use a deterministic clock; the local backend uses real time so time windows work. */
  useRealClock = false;
  private clock = Date.parse("2026-10-21T09:00:00Z");

  private stamp() {
    if (this.useRealClock) return new Date().toISOString();
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  private guard(op: string) {
    if (this.failWrites) throw new Error(`${op}: simulated database failure`);
  }

  async ping() {}
  async listOrders() {
    return [...this.orders.values()].map((o) => ({
      id: o.id,
      customerName: customerOf(o),
      createdAt: o.createdAt ?? null,
      unitCount: o.lines.reduce((s, l) => s + l.qty, 0),
      productIds: [...new Set(o.lines.map((l) => l.productId))],
    }));
  }
  async getOrder(id: string) {
    const o = this.orders.get(id);
    return o ? { id: o.id, customerName: customerOf(o), lines: o.lines } : null;
  }
  async createStoreOrder(customerName: string, lines: Array<{ productId: string; qty: number }>) {
    this.guard("createStoreOrder");
    const unknown = lines.find((l) => !this.products.has(l.productId));
    if (unknown) throw new Error(`createStoreOrder: unknown product ${unknown.productId}`); // the FK in Supabase
    // Next number after the highest store order, as in Supabase (other orders don't move it).
    const storeIds = [...this.orders.values()].filter((o) => o.demo === STORE_ORDER_TAG).map((o) => Number(o.id));
    const id = String(Math.max(STORE_FIRST_ORDER_ID - 1, ...storeIds) + 1);
    this.orders.set(id, { id, demo: STORE_ORDER_TAG, expect: customerName, createdAt: this.stamp(), lines: lines.map((l) => ({ ...l })) });
    return { id };
  }
  async listProducts() {
    return [...this.products.values()];
  }
  async getProducts(ids: string[]) {
    return ids.map((id) => this.products.get(id)).filter((p): p is Product => Boolean(p));
  }
  async listCartons() {
    return this.cartons;
  }
  async getShippingRates() {
    return this.rates;
  }
  async getFacts(ids: string[]) {
    return new Map(ids.filter((id) => this.facts.has(id)).map((id) => [id, this.facts.get(id)!]));
  }
  async listFacts() {
    return [...this.facts.values()];
  }
  async upsertFacts(f: StoredFacts) {
    this.guard("upsertFacts");
    this.facts.set(f.productId, f);
  }
  async saveExtractedFacts(f: StoredFacts) {
    this.guard("saveExtractedFacts");
    const now = this.facts.get(f.productId);
    if (now && (now.origin === "manual" || now.origin === "ai_corrected")) return now;
    this.facts.set(f.productId, f);
    return f;
  }
  async deleteFacts(productId: string | "all") {
    if (productId === "all") this.facts.clear();
    else this.facts.delete(productId);
  }
  async insertExtractionEvents(events: ExtractionEvent[]) {
    this.guard("insertExtractionEvents");
    for (const e of events) this.extractionEvents.push({ ...e, id: randomUUID(), createdAt: e.createdAt ?? this.stamp() });
  }
  async insertOrderRun(run: OrderRun) {
    this.guard("insertOrderRun");
    this.orderRuns.push({ ...run, createdAt: run.createdAt ?? this.stamp() });
  }
  async getOrderRun(runId: string) {
    return this.orderRuns.find((r) => r.id === runId) ?? null;
  }
  async latestOrderRunId(orderId: string) {
    // Newest first, ties by id, as the Supabase query orders them.
    const runs = this.orderRuns
      .filter((r) => r.trigger === "order" && r.orderId === orderId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.id.localeCompare(b.id));
    return runs[0]?.id ?? null;
  }
  async setOrderRunAction(runId: string, action: EmployeeAction) {
    this.guard("setOrderRunAction");
    const r = this.orderRuns.find((x) => x.id === runId);
    if (r) {
      r.employeeAction = action;
      r.actionAt = this.stamp();
    }
  }
  async insertCorrections(rows: Correction[]) {
    this.guard("insertCorrections");
    // Same rule as the database: corrections.run_id references order_runs(id).
    for (const c of rows) if (c.runId && !this.orderRuns.some((r) => r.id === c.runId)) throw new Error(`corrections_run_id_fkey: ${c.runId}`);
    for (const c of rows) this.corrections.push({ ...c, id: randomUUID(), createdAt: c.createdAt ?? this.stamp() });
  }
  private since<T extends { createdAt?: string }>(rows: T[], sinceIso: string | null) {
    return rows.filter((r) => !sinceIso || (r.createdAt ?? "") >= sinceIso);
  }
  async listExtractionEvents(sinceIso: string | null) {
    return this.since(this.extractionEvents, sinceIso);
  }
  async listOrderRuns(sinceIso: string | null) {
    return this.since(this.orderRuns, sinceIso);
  }
  async listQueueRuns() {
    return this.orderRuns.filter((r) => r.trigger === "order");
  }
  async listCorrections(sinceIso: string | null) {
    return this.since(this.corrections, sinceIso);
  }
  async getRunTrace(runId: string) {
    return {
      run: await this.getOrderRun(runId),
      extractions: this.extractionEvents.filter((e) => e.runId === runId),
      corrections: this.corrections.filter((c) => c.runId === runId),
    };
  }
  async listOpenAlerts() {
    return this.alerts.filter((a) => !a.resolvedAt);
  }
  async insertAlert(a: Alert) {
    this.guard("insertAlert");
    this.alerts.push({ ...a, id: randomUUID(), createdAt: this.stamp() });
  }
  async resolveAlert(id: string) {
    const a = this.alerts.find((x) => x.id === id);
    if (a) a.resolvedAt = this.stamp();
  }
  async insertEvalRun(run: EvalRun, results: EvalResult[]) {
    const id = randomUUID();
    this.evalRuns.push({ ...run, id, createdAt: this.stamp(), results });
    return id;
  }
  async latestEvalRuns(kind: EvalRun["kind"], limit: number) {
    return this.evalRuns.filter((r) => r.kind === kind).reverse().slice(0, limit);
  }
  async getEvalResults(evalRunId: string) {
    return this.evalRuns.find((r) => r.id === evalRunId)?.results ?? [];
  }
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";
import type { Carton, ShippingRates } from "@/lib/engine/types";
import type { Repo } from "./repo";
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

type Row = Record<string, unknown>;

export class DbError extends Error {
  constructor(op: string, message: string) {
    super(`${op}: ${message}`);
    this.name = "DbError";
  }
}

function check<T>(op: string, res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new DbError(op, res.error.message);
  return res.data;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---- row mappers (snake_case <-> camelCase) ----

const toProduct = (r: Row): Product => ({
  id: r.id as string,
  name: r.name as string,
  description: r.description as string,
  url: (r.url as string) ?? null,
  category: (r.category as string) ?? null,
  sourceHash: r.source_hash as string,
});

const toCarton = (r: Row): Carton => ({
  id: r.id as string,
  name: r.name as string,
  inner: [Number(r.inner_l_cm), Number(r.inner_w_cm), Number(r.inner_h_cm)],
  maxWeightG: Number(r.max_weight_g),
  tareG: Number(r.tare_g),
  costSar: Number(r.cost_sar),
});

const toFacts = (r: Row): StoredFacts => ({
  productId: r.product_id as string,
  lengthCm: num(r.length_cm),
  widthCm: num(r.width_cm),
  heightCm: num(r.height_cm),
  weightG: num(r.weight_g),
  dimsSource: r.dims_source as StoredFacts["dimsSource"],
  weightSource: r.weight_source as StoredFacts["weightSource"],
  fragile: r.fragile as boolean,
  liquid: r.liquid as boolean,
  sensitive: r.sensitive as boolean,
  confidence: (r.confidence as StoredFacts["confidence"]) ?? null,
  evidence: (r.evidence as string) ?? null,
  origin: r.origin as StoredFacts["origin"],
  sourceHash: r.source_hash as string,
  model: (r.model as string) ?? null,
  promptVersion: (r.prompt_version as string) ?? null,
  extractedAt: (r.extracted_at as string) ?? null,
  updatedAt: r.updated_at as string,
});

const fromFacts = (f: StoredFacts): Row => ({
  product_id: f.productId,
  length_cm: f.lengthCm,
  width_cm: f.widthCm,
  height_cm: f.heightCm,
  weight_g: f.weightG,
  dims_source: f.dimsSource,
  weight_source: f.weightSource,
  fragile: f.fragile,
  liquid: f.liquid,
  sensitive: f.sensitive,
  confidence: f.confidence,
  evidence: f.evidence,
  origin: f.origin,
  source_hash: f.sourceHash,
  model: f.model,
  prompt_version: f.promptVersion,
  extracted_at: f.extractedAt,
  updated_at: f.updatedAt,
});

const fromExtraction = (e: ExtractionEvent): Row => ({
  run_id: e.runId,
  trigger: e.trigger,
  product_id: e.productId,
  status: e.status,
  latency_ms: Math.round(e.latencyMs),
  input_tokens: e.inputTokens,
  output_tokens: e.outputTokens,
  thinking_tokens: e.thinkingTokens,
  cost_usd: e.costUsd,
  model: e.model,
  prompt_version: e.promptVersion,
  dims_source: e.dimsSource,
  weight_source: e.weightSource,
  confidence: e.confidence,
  fragile: e.fragile,
  liquid: e.liquid,
  error_code: e.errorCode,
  error_message: e.errorMessage,
});

const toExtraction = (r: Row): ExtractionEvent => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  runId: (r.run_id as string) ?? null,
  trigger: r.trigger as ExtractionEvent["trigger"],
  productId: r.product_id as string,
  status: r.status as ExtractionEvent["status"],
  latencyMs: Number(r.latency_ms ?? 0),
  inputTokens: Number(r.input_tokens ?? 0),
  outputTokens: Number(r.output_tokens ?? 0),
  thinkingTokens: Number(r.thinking_tokens ?? 0),
  costUsd: Number(r.cost_usd ?? 0),
  model: (r.model as string) ?? null,
  promptVersion: (r.prompt_version as string) ?? "",
  dimsSource: (r.dims_source as ExtractionEvent["dimsSource"]) ?? null,
  weightSource: (r.weight_source as ExtractionEvent["weightSource"]) ?? null,
  confidence: (r.confidence as ExtractionEvent["confidence"]) ?? null,
  fragile: (r.fragile as boolean) ?? null,
  liquid: (r.liquid as boolean) ?? null,
  errorCode: (r.error_code as string) ?? null,
  errorMessage: (r.error_message as string) ?? null,
});

const fromRun = (r: OrderRun): Row => ({
  id: r.id,
  trigger: r.trigger,
  order_id: r.orderId,
  status: r.status,
  carton_id: r.cartonId,
  strategy: r.strategy,
  items_count: r.itemsCount,
  cache_hits: r.cacheHits,
  cache_misses: r.cacheMisses,
  estimated_units: r.estimatedUnits,
  unit_sources: r.unitSources,
  ai_products: r.aiProducts,
  extract_ms: Math.round(r.extractMs),
  pack_ms: Math.round(r.packMs),
  total_ms: Math.round(r.totalMs),
  candidates_checked: r.candidatesChecked,
  attempts: r.attempts,
  validator_rejections: r.validatorRejections,
  violations: r.violations,
  carton_cost_sar: r.cartonCostSar,
  shipping_sar: r.shippingSar,
  total_sar: r.totalSar,
  tokens_total: r.tokensTotal,
  cost_usd: r.costUsd,
  engine_version: r.engineVersion,
  prompt_version: r.promptVersion,
  monitoring_degraded: r.monitoringDegraded,
  error_code: r.errorCode,
  employee_action: r.employeeAction,
  action_at: r.actionAt,
});

const toRun = (r: Row): OrderRun => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  trigger: r.trigger as OrderRun["trigger"],
  orderId: r.order_id as string,
  status: r.status as OrderRun["status"],
  cartonId: (r.carton_id as string) ?? null,
  strategy: (r.strategy as string) ?? null,
  itemsCount: Number(r.items_count ?? 0),
  cacheHits: Number(r.cache_hits ?? 0),
  cacheMisses: Number(r.cache_misses ?? 0),
  estimatedUnits: Number(r.estimated_units ?? 0),
  unitSources: (r.unit_sources as OrderRun["unitSources"]) ?? { page: 0, inferred: 0, manual: 0, unknown: 0 },
  aiProducts: (r.ai_products as string[]) ?? [],
  extractMs: Number(r.extract_ms ?? 0),
  packMs: Number(r.pack_ms ?? 0),
  totalMs: Number(r.total_ms ?? 0),
  candidatesChecked: Number(r.candidates_checked ?? 0),
  attempts: (r.attempts as OrderRun["attempts"]) ?? [],
  validatorRejections: Number(r.validator_rejections ?? 0),
  violations: (r.violations as OrderRun["violations"]) ?? [],
  cartonCostSar: num(r.carton_cost_sar),
  shippingSar: num(r.shipping_sar),
  totalSar: num(r.total_sar),
  tokensTotal: Number(r.tokens_total ?? 0),
  costUsd: Number(r.cost_usd ?? 0),
  engineVersion: (r.engine_version as string) ?? "",
  promptVersion: (r.prompt_version as string) ?? "",
  monitoringDegraded: Boolean(r.monitoring_degraded),
  errorCode: (r.error_code as string) ?? null,
  employeeAction: r.employee_action as OrderRun["employeeAction"],
  actionAt: (r.action_at as string) ?? null,
});

const toCorrection = (r: Row): Correction => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  runId: (r.run_id as string) ?? null,
  productId: r.product_id as string,
  field: r.field as string,
  oldValue: (r.old_value as string) ?? null,
  newValue: (r.new_value as string) ?? null,
  priorOrigin: r.prior_origin as Correction["priorOrigin"],
});

const toAlert = (r: Row): Alert => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  rule: r.rule as string,
  severity: r.severity as Alert["severity"],
  value: Number(r.value),
  threshold: Number(r.threshold),
  sampleSize: Number(r.sample_size),
  message: (r.message as string) ?? "",
  simulated: Boolean(r.simulated),
  resolvedAt: (r.resolved_at as string) ?? null,
});

const toEvalRun = (r: Row): EvalRun => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  kind: r.kind as EvalRun["kind"],
  model: (r.model as string) ?? null,
  promptVersion: (r.prompt_version as string) ?? null,
  engineVersion: (r.engine_version as string) ?? null,
  summary: (r.summary as Record<string, unknown>) ?? {},
});

export class SupabaseRepo implements Repo {
  constructor(private readonly db: SupabaseClient) {}

  async ping() {
    check("ping", await this.db.from("cartons").select("id").limit(1));
  }

  async listOrders(): Promise<OrderSummary[]> {
    const rows = check("listOrders", await this.db.from("orders").select("id, demo, expect, order_items(qty)").order("id")) as Row[];
    return rows.map((r) => {
      const items = (r.order_items as Array<{ qty: number }>) ?? [];
      return {
        id: r.id as string,
        demo: (r.demo as string) ?? null,
        expect: (r.expect as string) ?? null,
        lineCount: items.length,
        unitCount: items.reduce((s, i) => s + i.qty, 0),
      };
    });
  }

  async getOrder(orderId: string): Promise<OrderWithLines | null> {
    const rows = check(
      "getOrder",
      await this.db.from("orders").select("id, demo, order_items(product_id, qty)").eq("id", orderId).limit(1),
    ) as Row[];
    if (rows.length === 0) return null;
    const r = rows[0];
    const items = (r.order_items as Array<{ product_id: string; qty: number }>) ?? [];
    return {
      id: r.id as string,
      demo: (r.demo as string) ?? null,
      lines: items.map((i) => ({ productId: i.product_id, qty: i.qty })).sort((a, b) => a.productId.localeCompare(b.productId)),
    };
  }

  async listProducts() {
    return (check("listProducts", await this.db.from("products").select("*").order("id")) as Row[]).map(toProduct);
  }

  async getProducts(ids: string[]) {
    if (ids.length === 0) return [];
    return (check("getProducts", await this.db.from("products").select("*").in("id", ids)) as Row[]).map(toProduct);
  }

  async listCartons() {
    return (check("listCartons", await this.db.from("cartons").select("*").order("cost_sar")) as Row[]).map(toCarton);
  }

  async getShippingRates(): Promise<ShippingRates> {
    const rows = check("getShippingRates", await this.db.from("shipping_rates").select("*").eq("id", 1)) as Row[];
    if (rows.length === 0) throw new DbError("getShippingRates", "no shipping_rates row (run the seed)");
    return {
      baseSar: Number(rows[0].base_sar),
      perKgSar: Number(rows[0].per_kg_sar),
      volumetricDivisor: Number(rows[0].volumetric_divisor),
    };
  }

  async getFacts(ids: string[]) {
    if (ids.length === 0) return new Map<string, StoredFacts>();
    const rows = check("getFacts", await this.db.from("product_facts").select("*").in("product_id", ids)) as Row[];
    return new Map(rows.map((r) => [r.product_id as string, toFacts(r)]));
  }

  async listFacts() {
    return (check("listFacts", await this.db.from("product_facts").select("*").order("product_id")) as Row[]).map(toFacts);
  }

  async upsertFacts(facts: StoredFacts) {
    check("upsertFacts", await this.db.from("product_facts").upsert(fromFacts(facts), { onConflict: "product_id" }));
  }

  async deleteFacts(productId: string | "all") {
    const q = this.db.from("product_facts").delete();
    check("deleteFacts", productId === "all" ? await q.neq("product_id", "") : await q.eq("product_id", productId));
  }

  async insertExtractionEvents(events: ExtractionEvent[]) {
    if (events.length === 0) return;
    check("insertExtractionEvents", await this.db.from("extraction_events").insert(events.map(fromExtraction)));
  }

  async insertOrderRun(run: OrderRun) {
    check("insertOrderRun", await this.db.from("order_runs").insert(fromRun(run)));
  }

  async getOrderRun(runId: string) {
    const rows = check("getOrderRun", await this.db.from("order_runs").select("*").eq("id", runId).limit(1)) as Row[];
    return rows.length ? toRun(rows[0]) : null;
  }

  async setOrderRunAction(runId: string, action: EmployeeAction) {
    check(
      "setOrderRunAction",
      await this.db.from("order_runs").update({ employee_action: action, action_at: new Date().toISOString() }).eq("id", runId),
    );
  }

  async insertCorrections(rows: Correction[]) {
    if (rows.length === 0) return;
    check(
      "insertCorrections",
      await this.db.from("corrections").insert(
        rows.map((c) => ({
          run_id: c.runId,
          product_id: c.productId,
          field: c.field,
          old_value: c.oldValue,
          new_value: c.newValue,
          prior_origin: c.priorOrigin,
        })),
      ),
    );
  }

  async listExtractionEvents(sinceIso: string | null) {
    let q = this.db.from("extraction_events").select("*").order("created_at", { ascending: false }).limit(5000);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    return (check("listExtractionEvents", await q) as Row[]).map(toExtraction);
  }

  async listOrderRuns(sinceIso: string | null) {
    let q = this.db.from("order_runs").select("*").order("created_at", { ascending: false }).limit(5000);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    return (check("listOrderRuns", await q) as Row[]).map(toRun);
  }

  async listCorrections(sinceIso: string | null) {
    let q = this.db.from("corrections").select("*").order("created_at", { ascending: false }).limit(5000);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    return (check("listCorrections", await q) as Row[]).map(toCorrection);
  }

  async getRunTrace(runId: string) {
    const [run, ex, co] = await Promise.all([
      this.getOrderRun(runId),
      this.db.from("extraction_events").select("*").eq("run_id", runId).order("created_at"),
      this.db.from("corrections").select("*").eq("run_id", runId).order("created_at"),
    ]);
    return {
      run,
      extractions: (check("trace.extractions", ex) as Row[]).map(toExtraction),
      corrections: (check("trace.corrections", co) as Row[]).map(toCorrection),
    };
  }

  async listOpenAlerts() {
    return (
      check("listOpenAlerts", await this.db.from("alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false })) as Row[]
    ).map(toAlert);
  }

  async insertAlert(a: Alert) {
    check(
      "insertAlert",
      await this.db.from("alerts").insert({
        rule: a.rule,
        severity: a.severity,
        value: a.value,
        threshold: a.threshold,
        sample_size: a.sampleSize,
        message: a.message,
        simulated: a.simulated,
      }),
    );
  }

  async resolveAlert(id: string) {
    check("resolveAlert", await this.db.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", id));
  }

  async insertEvalRun(run: EvalRun, results: EvalResult[]) {
    const rows = check(
      "insertEvalRun",
      await this.db
        .from("eval_runs")
        .insert({ kind: run.kind, model: run.model, prompt_version: run.promptVersion, engine_version: run.engineVersion, summary: run.summary })
        .select("id"),
    ) as Row[];
    const id = rows[0].id as string;
    for (let i = 0; i < results.length; i += 200) {
      check(
        "insertEvalResults",
        await this.db.from("eval_results").insert(
          results.slice(i, i + 200).map((r) => ({ eval_run_id: id, case_id: r.caseId, passed: r.passed, details: r.details })),
        ),
      );
    }
    return id;
  }

  async latestEvalRuns(kind: EvalRun["kind"], limit: number) {
    return (
      check("latestEvalRuns", await this.db.from("eval_runs").select("*").eq("kind", kind).order("created_at", { ascending: false }).limit(limit)) as Row[]
    ).map(toEvalRun);
  }

  async getEvalResults(evalRunId: string) {
    const rows = check("getEvalResults", await this.db.from("eval_results").select("*").eq("eval_run_id", evalRunId).order("case_id")) as Row[];
    return rows.map((r) => ({ caseId: r.case_id as string, passed: (r.passed as boolean) ?? null, details: (r.details as Record<string, unknown>) ?? {} }));
  }
}

let cached: SupabaseRepo | null = null;

/** Server-side repo using the service-role key. Throws EnvError if Supabase is not configured. */
export function getRepo(): Repo {
  if (!cached) {
    const env = supabaseEnv();
    cached = new SupabaseRepo(
      createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
    );
  }
  return cached;
}

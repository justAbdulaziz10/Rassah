// The pack pipeline: order → catalog (cache / Gemini) → engine → validator → events → alerts.
// Framework-free so it can be tested end to end with the in-memory repo and a fake extractor.

import { getOrExtractFacts } from "@/lib/ai/catalog";
import type { ExtractDeps } from "@/lib/ai/extractor";
import type { Repo } from "@/lib/db/repo";
import type { Correction, ExtractionEvent, OrderRun, StoredFacts } from "@/lib/db/types";
import { ENGINE_CONFIG, packOrder, smallerCartons, type EngineConfig, type InstructionStep, type SmallerCarton } from "@/lib/engine";
import type { CartonAttempt, CostEstimate, DataSource, Placement, ProductFacts, Unit } from "@/lib/engine/types";
import { evaluateRules, syncAlerts } from "@/lib/monitoring/alerts";

export interface PackItemView {
  unitId: string;
  productId: string;
  name: string;
  facts: {
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
    weightG: number | null;
    dimsSource: DataSource;
    weightSource: DataSource;
    fragile: boolean;
    liquid: boolean;
    sensitive: boolean;
    confidence: string | null;
    evidence: string | null;
    origin: StoredFacts["origin"];
  };
  effectiveCm: [number, number, number];
  marginApplied: boolean;
  paddingApplied: boolean;
  placement: { x: number; y: number; z: number; dx: number; dy: number; dz: number };
}

export interface PackResponse {
  runId: string;
  orderId: string;
  status: "box_found" | "no_box" | "needs_measurement" | "error" | "not_found";
  carton: { id: string; name: string; innerCm: [number, number, number] } | null;
  items: PackItemView[];
  instructions: InstructionStep[];
  cost: CostEstimate | null;
  reason: string | null;
  attempts: CartonAttempt[];
  /** With box_found: the cartons smaller than the chosen one and why each was not used, nearest in size first. */
  smaller: SmallerCarton[];
  /** `known` holds what is already stored (flags, any measured side), so measuring keeps it instead of resetting it. */
  productsToMeasure: Array<{ productId: string; name: string; failedExtraction: boolean; known: MeasureStart }>;
  /** origin is null when the product has no stored facts. */
  lines: Array<{ productId: string; name: string; qty: number; dimsSource: DataSource; origin: StoredFacts["origin"] | null }>;
  timings: { extractMs: number; packMs: number; totalMs: number };
  cache: { hits: number; misses: number };
  monitoring: { saved: boolean };
  errorMessage: string | null;
  /** Machine-readable cause when status is error or not_found (same code as the stored run). */
  errorCode: string | null;
  /** Where the order came from: "rassah" (own database) or the external platform's name. */
  orderSource: string;
  /**
   * Only with status no_box: the order split into several cartons, each box searched and validated
   * like a normal answer. null when no split works either (e.g. one item fits no carton).
   */
  split: PackSplitView | null;
}

export interface MeasureStart {
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightG: number | null;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
}

interface PackSplitView {
  boxes: Array<{
    carton: { id: string; name: string; innerCm: [number, number, number] };
    items: PackItemView[];
    instructions: InstructionStep[];
    cost: CostEstimate;
  }>;
  totalSar: number;
}

export interface PackRequest {
  repo: Repo;
  orderId: string;
  runId: string;
  deps: ExtractDeps;
  engineVersion: string;
  promptVersion: string;
  config?: EngineConfig;
  webhookUrl?: string;
  now?: () => number;
  nowMs?: () => number;
  /**
   * Optional external order source (an e-commerce platform's orders API, e.g. the demo store or,
   * later, Salla). Used only when the order is not in Rassah's own database. The order is read,
   * never written to Rassah's tables; its products must already be in Rassah's catalog.
   */
  externalOrders?: (orderId: string) => Promise<ExternalOrder | null>;
  /** Runs the alert check after the response is sent (the route passes `after`); awaited inline when absent. */
  defer?: (task: () => Promise<void>) => void;
}

export interface ExternalOrder {
  id: string;
  source: string;
  lines: Array<{ productId: string; qty: number }>;
}

const zeroSources = (): Record<DataSource, number> => ({ page: 0, inferred: 0, manual: 0, unknown: 0 });

export async function runPack(req: PackRequest): Promise<PackResponse> {
  const now = req.now ?? (() => performance.now());
  const nowMs = req.nowMs ?? (() => Date.now());
  const config = req.config ?? ENGINE_CONFIG;
  const t0 = now();

  const response: PackResponse = {
    runId: req.runId,
    orderId: req.orderId,
    status: "error",
    carton: null,
    items: [],
    instructions: [],
    cost: null,
    reason: null,
    attempts: [],
    smaller: [],
    productsToMeasure: [],
    lines: [],
    timings: { extractMs: 0, packMs: 0, totalMs: 0 },
    cache: { hits: 0, misses: 0 },
    monitoring: { saved: true },
    errorMessage: null,
    errorCode: null,
    orderSource: "rassah",
    split: null,
  };
  const run: OrderRun = {
    id: req.runId,
    trigger: "order",
    orderId: req.orderId,
    status: "error",
    cartonId: null,
    strategy: null,
    itemsCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    estimatedUnits: 0,
    unitSources: zeroSources(),
    aiProducts: [],
    extractMs: 0,
    packMs: 0,
    totalMs: 0,
    candidatesChecked: 0,
    attempts: [],
    validatorRejections: 0,
    violations: [],
    cartonCostSar: null,
    shippingSar: null,
    totalSar: null,
    tokensTotal: 0,
    costUsd: 0,
    engineVersion: req.engineVersion,
    promptVersion: req.promptVersion,
    monitoringDegraded: false,
    errorCode: null,
    employeeAction: "pending",
    actionAt: null,
  };
  let extractionEvents: Awaited<ReturnType<typeof getOrExtractFacts>>["events"] = [];

  try {
    let order = await req.repo.getOrder(req.orderId);
    let externalError: string | null = null;
    if (!order && req.externalOrders) {
      // Not in Rassah's own store: ask the connected platform (read-only, nothing is copied in).
      try {
        const ext = await req.externalOrders(req.orderId);
        if (ext) {
          order = { id: ext.id, customerName: null, lines: ext.lines };
          response.orderSource = ext.source;
        }
      } catch (err) {
        externalError = (err as Error)?.message?.slice(0, 200) ?? "store unreachable";
      }
    }
    const productIds = order ? [...new Set(order.lines.map((l) => l.productId))] : [];
    // Everything the pack needs, in one round trip.
    const [products, stored, cartons, rates] = order
      ? await Promise.all([
          req.repo.getProducts(productIds),
          req.repo.getFacts(productIds),
          req.repo.listCartons(),
          req.repo.getShippingRates(),
        ])
      : [[], new Map<string, StoredFacts>(), [], null];
    const names = new Map(products.map((p) => [p.id, p.name]));
    const missing = productIds.filter((id) => !names.has(id));
    if (externalError) {
      response.status = "error";
      response.errorMessage = `Could not reach the store's orders API: ${externalError}`;
      run.errorCode = "store_unreachable";
    } else if (!order) {
      response.status = "not_found";
      response.errorMessage = `Order ${req.orderId} not found`;
      run.errorCode = "order_not_found";
    } else if (missing.length > 0) {
      response.status = "error";
      response.errorMessage = `Products not in Rassah's catalog yet: ${missing.join(", ")}`;
      run.errorCode = "product_not_in_catalog";
    } else {
      const tExtract = now();
      const catalog = await getOrExtractFacts({
        repo: req.repo,
        productIds,
        deps: req.deps,
        trigger: "order",
        runId: req.runId,
        preloaded: { products, facts: stored },
      });
      run.extractMs = now() - tExtract;
      extractionEvents = catalog.events;
      run.cacheHits = catalog.cacheHits;
      run.cacheMisses = catalog.cacheMisses;
      run.monitoringDegraded = catalog.degraded;
      run.tokensTotal = catalog.events.reduce((s, e) => s + e.inputTokens + e.outputTokens + e.thinkingTokens, 0);
      run.costUsd = catalog.events.reduce((s, e) => s + e.costUsd, 0);
      const failedExtraction = new Set(catalog.events.filter((e) => e.status !== "ok").map((e) => e.productId));

      const lines = order.lines.map((l) => ({ productId: l.productId, name: names.get(l.productId) ?? l.productId, qty: l.qty }));
      for (const l of lines) {
        const f = catalog.facts.get(l.productId);
        const src = f?.dimsSource ?? "unknown";
        run.unitSources[src] += l.qty;
        response.lines.push({ ...l, dimsSource: src, origin: f?.origin ?? null });
      }
      run.itemsCount = lines.reduce((s, l) => s + l.qty, 0);
      run.estimatedUnits = run.unitSources.inferred;
      run.aiProducts = [...catalog.facts.values()].filter((f) => f.origin === "ai").map((f) => f.productId);

      const itemViews = (placements: Placement[], units: Unit[]): PackItemView[] => {
        const unitById = new Map(units.map((u) => [u.unitId, u]));
        return placements.map((p) => {
          const u = unitById.get(p.unitId)!;
          const f = catalog.facts.get(u.productId)!;
          return {
            unitId: u.unitId,
            productId: u.productId,
            name: u.name,
            facts: {
              lengthCm: f.lengthCm,
              widthCm: f.widthCm,
              heightCm: f.heightCm,
              weightG: f.weightG,
              dimsSource: f.dimsSource,
              weightSource: f.weightSource,
              fragile: f.fragile,
              liquid: f.liquid,
              sensitive: f.sensitive,
              confidence: f.confidence,
              evidence: f.evidence,
              origin: f.origin,
            },
            effectiveCm: u.dims,
            marginApplied: u.estimated,
            paddingApplied: u.fragile || u.sensitive,
            placement: { x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz },
          };
        });
      };

      const tPack = now();
      const result = packOrder(lines, catalog.facts as Map<string, ProductFacts>, cartons, rates!, config);
      run.packMs = now() - tPack;

      if (result.status === "needs_measurement") {
        response.status = run.status = "needs_measurement";
        response.productsToMeasure = result.productIds.map((id) => {
          // A failed re-read leaves the older stored row out of catalog.facts; its flags still prefill the form.
          const f = catalog.facts.get(id) ?? stored.get(id);
          return {
            productId: id,
            name: names.get(id) ?? id,
            failedExtraction: failedExtraction.has(id),
            known: {
              lengthCm: f?.lengthCm ?? null,
              widthCm: f?.widthCm ?? null,
              heightCm: f?.heightCm ?? null,
              weightG: f?.weightG ?? null,
              fragile: f?.fragile ?? false,
              liquid: f?.liquid ?? false,
              sensitive: f?.sensitive ?? false,
            },
          };
        });
      } else if (result.status === "invalid_input") {
        response.status = "error";
        run.errorCode = "invalid_input";
        response.errorMessage = result.message;
      } else {
        run.attempts = response.attempts = result.attempts;
        run.candidatesChecked = result.candidatesChecked;
        run.validatorRejections = result.validatorRejections;
        run.violations = result.violations.map((v) => ({ code: v.code, unitId: v.unitId, cartonId: v.cartonId, detail: v.detail }));
        if (result.status === "no_box") {
          response.status = run.status = "no_box";
          response.reason = result.reason;
          if (result.split) {
            // Kept as no_box (no single carton fits); the strategy records the split for the order queue.
            run.strategy = `split_${result.split.boxes.length}`;
            run.totalSar = result.split.totalSar;
            response.split = {
              boxes: result.split.boxes.map((b) => ({
                carton: { id: b.carton.id, name: b.carton.name, innerCm: b.carton.inner },
                items: itemViews(b.placements, b.units),
                instructions: b.instructions,
                cost: b.cost,
              })),
              totalSar: result.split.totalSar,
            };
          }
        } else {
          response.status = run.status = "box_found";
          run.cartonId = result.carton.id;
          run.strategy = result.strategy;
          run.cartonCostSar = result.cost.cartonSar;
          run.shippingSar = result.cost.shippingSar;
          run.totalSar = result.cost.totalSar;
          response.carton = { id: result.carton.id, name: result.carton.name, innerCm: result.carton.inner };
          response.cost = result.cost;
          response.instructions = result.instructions ?? [];
          response.items = itemViews(result.placements, result.units);
          response.smaller = smallerCartons(result.carton, cartons, result.units, result.attempts);
        }
      }
    }
  } catch (err) {
    response.status = "error";
    run.status = "error";
    run.errorCode = run.errorCode ?? "unexpected";
    response.errorMessage = (err as Error)?.message?.slice(0, 300) ?? "unexpected error";
  }

  run.totalMs = now() - t0;
  response.timings = { extractMs: Math.round(run.extractMs), packMs: Math.round(run.packMs), totalMs: Math.round(run.totalMs) };
  response.cache = { hits: run.cacheHits, misses: run.cacheMisses };
  if (response.status === "not_found") run.status = "error";
  response.errorCode = run.errorCode;

  // Monitoring writes must never break the product: on failure the result is still returned.
  const saved = await Promise.allSettled([req.repo.insertOrderRun(run), req.repo.insertExtractionEvents(extractionEvents)]);
  if (run.monitoringDegraded || saved.some((r) => r.status === "rejected")) response.monitoring.saved = false;

  // Alert evaluation is best effort (the dashboard re-evaluates on load), so it never delays or fails the pack.
  const alerts = () => refreshAlerts(req.repo, nowMs(), req.webhookUrl).then(
    () => {},
    () => {},
  );
  if (req.defer) req.defer(alerts);
  else await alerts();

  return response;
}

/** Alert rules look at the last 7 days of events. */
export const alertsSince = (nowMs: number) => new Date(nowMs - 7 * 24 * 3600_000).toISOString();

/** Re-evaluates every alert rule against recent events and opens/resolves alerts. */
export async function refreshAlerts(repo: Repo, nowMs: number, webhookUrl?: string, loaded?: AlertInput) {
  const input = loaded ?? (await readAlertInput(repo, alertsSince(nowMs)));
  return syncAlerts(repo, evaluateRules({ ...input, nowMs }), { webhookUrl });
}

async function readAlertInput(repo: Repo, since: string): Promise<AlertInput> {
  const [extractions, runs, corrections] = await Promise.all([
    repo.listExtractionEvents(since),
    repo.listOrderRuns(since),
    repo.listCorrections(since),
  ]);
  return { extractions, runs, corrections };
}

/** The last 7 days of events, when the caller already read them. */
interface AlertInput {
  extractions: ExtractionEvent[];
  runs: OrderRun[];
  corrections: Correction[];
}

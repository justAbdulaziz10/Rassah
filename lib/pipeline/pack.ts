// The pack pipeline: order → catalog (cache / Gemini) → engine → validator → events → alerts.
// Framework-free so it can be tested end to end with the in-memory repo and a fake extractor.

import { getOrExtractFacts } from "@/lib/ai/catalog";
import type { ExtractDeps } from "@/lib/ai/extractor";
import type { Repo } from "@/lib/db/repo";
import type { OrderRun, StoredFacts } from "@/lib/db/types";
import { ENGINE_CONFIG, packOrder, type EngineConfig, type InstructionStep } from "@/lib/engine";
import type { CartonAttempt, CostEstimate, DataSource, ProductFacts } from "@/lib/engine/types";
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
  productsToMeasure: Array<{ productId: string; name: string; failedExtraction: boolean }>;
  /** origin is null when the product has no stored facts. */
  lines: Array<{ productId: string; name: string; qty: number; dimsSource: DataSource; origin: StoredFacts["origin"] | null }>;
  timings: { extractMs: number; packMs: number; totalMs: number };
  cache: { hits: number; misses: number };
  monitoring: { saved: boolean };
  errorMessage: string | null;
  /** Where the order came from: "rassah" (own database) or the external platform's name. */
  orderSource: string;
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
    productsToMeasure: [],
    lines: [],
    timings: { extractMs: 0, packMs: 0, totalMs: 0 },
    cache: { hits: 0, misses: 0 },
    monitoring: { saved: true },
    errorMessage: null,
    orderSource: "rassah",
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
          order = { id: ext.id, demo: null, lines: ext.lines };
          response.orderSource = ext.source;
        }
      } catch (err) {
        externalError = (err as Error)?.message?.slice(0, 200) ?? "store unreachable";
      }
    }
    const missing = order
      ? await req.repo.getProducts(order.lines.map((l) => l.productId)).then((ps) => {
          const known = new Set(ps.map((p) => p.id));
          return order!.lines.map((l) => l.productId).filter((id) => !known.has(id));
        })
      : [];
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
      const productIds = order.lines.map((l) => l.productId);
      const [products, cartons, rates] = await Promise.all([
        req.repo.getProducts(productIds),
        req.repo.listCartons(),
        req.repo.getShippingRates(),
      ]);
      const names = new Map(products.map((p) => [p.id, p.name]));

      const tExtract = now();
      const catalog = await getOrExtractFacts({ repo: req.repo, productIds, deps: req.deps, trigger: "order", runId: req.runId });
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

      const tPack = now();
      const result = packOrder(lines, catalog.facts as Map<string, ProductFacts>, cartons, rates, config);
      run.packMs = now() - tPack;

      if (result.status === "needs_measurement") {
        response.status = run.status = "needs_measurement";
        response.productsToMeasure = result.productIds.map((id) => ({
          productId: id,
          name: names.get(id) ?? id,
          failedExtraction: failedExtraction.has(id),
        }));
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
          const unitById = new Map(result.units.map((u) => [u.unitId, u]));
          response.items = result.placements.map((p) => {
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

  // Monitoring writes must never break the product: on failure the result is still returned.
  try {
    await req.repo.insertOrderRun(run);
    await req.repo.insertExtractionEvents(extractionEvents);
  } catch {
    response.monitoring.saved = false;
  }
  if (run.monitoringDegraded) response.monitoring.saved = false;

  try {
    await refreshAlerts(req.repo, nowMs(), req.webhookUrl);
  } catch {
    // Alert evaluation is best effort; the dashboard re-evaluates on load.
  }

  return response;
}

/** Re-evaluates every alert rule against recent events and opens/resolves alerts. */
export async function refreshAlerts(repo: Repo, nowMs: number, webhookUrl?: string) {
  const since = new Date(nowMs - 7 * 24 * 3600_000).toISOString();
  const [extractions, runs, corrections] = await Promise.all([
    repo.listExtractionEvents(since),
    repo.listOrderRuns(since),
    repo.listCorrections(since),
  ]);
  return syncAlerts(repo, evaluateRules({ extractions, runs, corrections, nowMs }), { webhookUrl });
}

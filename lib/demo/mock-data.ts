// Mock history for demos: every state the console can show, on mock orders 9001+ (orders.demo = "mock").
// Pure and deterministic (seeded random), with timestamps relative to `nowMs`, so the same command always
// writes the same story ending "now". Written to Supabase by scripts/demo-data.ts and loaded by the local
// backend when MEMORY_MOCK_DATA=true. Every row id starts with MOCK_ID_PREFIX, so removal is exact.
//
// What it covers, by page:
// - Orders / notifications: new, ready, done, done after an edit or a measurement, and every attention
//   reason (needs measurement, no carton, split into cartons, error), plus mistyped order numbers.
// - Monitoring: all seven metrics in every window (the last hour has too few cases, the last 24 h and
//   7 days have enough), every extraction failure status, corrections on several fields, a validator
//   rejection three days ago, slow outliers, cached and uncached runs, and the open alerts that follow
//   from that data (critical, warning and info).

import type { Correction, ExtractionEvent, OrderRun, RunStatus } from "@/lib/db/types";
import type { CartonAttempt, DataSource } from "@/lib/engine/types";

export const MOCK_ORDER_TAG = "mock";
export const MOCK_ID_PREFIX = "00d3e000-0000-4000-8000-";
export const MOCK_ID_RANGE = { min: `${MOCK_ID_PREFIX}000000000000`, max: `${MOCK_ID_PREFIX}ffffffffffff` };

export interface MockOrder {
  id: string;
  expect: string;
  lines: Array<{ productId: string; qty: number }>;
  createdAt: string;
}

export interface MockData {
  orders: MockOrder[];
  runs: OrderRun[];
  extractions: ExtractionEvent[];
  corrections: Correction[];
}

type Line = { productId: string; qty: number };
const L = (...pairs: Array<[string, number]>): Line[] => pairs.map(([productId, qty]) => ({ productId, qty }));

// Item mixes copied from the seeded orders (data/orders.json), so opening a mock order packs like its twin.
const TEMPLATES: Record<string, { lines: Line[]; carton: string | null; twin: string }> = {
  book: { lines: L(["p-02", 1]), carton: "FLAT", twin: "1001" },
  perfume: { lines: L(["p-16", 1], ["p-17", 1], ["p-19", 1]), carton: "L", twin: "1002" },
  liquids: { lines: L(["p-07", 1], ["p-10", 1]), carton: "XL", twin: "1003" },
  fragileHeavy: { lines: L(["p-03", 1], ["p-13", 1], ["p-11", 1]), carton: "L", twin: "1004" },
  electronics: { lines: L(["p-04", 1], ["p-08", 1], ["p-12", 1]), carton: "L", twin: "1005" },
  flat: { lines: L(["p-06", 2], ["p-02", 1]), carton: "FLAT", twin: "1007" },
  mugs: { lines: L(["p-09", 1], ["p-05", 1]), carton: "L", twin: "1008" },
  skincare: { lines: L(["p-14", 2], ["p-18", 1], ["p-23", 1]), carton: "M", twin: "1009" },
  coffee: { lines: L(["p-20", 2], ["p-26", 1], ["p-21", 2]), carton: "M", twin: "1010" },
  dryer: { lines: L(["p-15", 1], ["p-27", 1], ["p-24", 1]), carton: "L", twin: "1011" },
  bottle: { lines: L(["p-22", 1], ["p-17", 2]), carton: "L", twin: "1012" },
  plates: { lines: L(["p-25", 1], ["p-13", 1]), carton: "XL", twin: "1013" },
  perfumes: { lines: L(["p-01", 1], ["p-16", 2]), carton: "M", twin: "1014" },
  stationery: { lines: L(["p-11", 3], ["p-02", 3]), carton: "L", twin: "1015" },
  basket: { lines: L(["p-07", 1], ["p-13", 1], ["p-03", 1], ["p-20", 1]), carton: "L", twin: "1016" },
  phone: { lines: L(["p-06", 1], ["p-19", 2], ["p-27", 1], ["p-04", 1]), carton: "M", twin: "1018" },
  oils: { lines: L(["p-10", 2], ["p-14", 2]), carton: "L", twin: "1019" },
  gift: { lines: L(["p-28", 1], ["p-02", 1]), carton: "M", twin: "1006" },
  unnamed: { lines: L(["p-29", 2], ["p-30", 1]), carton: "L", twin: "1017" },
  heavy: { lines: L(["p-25", 3], ["p-10", 3], ["p-13", 3], ["p-15", 3]), carton: null, twin: "1020" },
};

// Where each product's measurements come from in the seeded catalog (unknown until someone measures it).
const INFERRED = new Set(["p-16", "p-18", "p-20", "p-21", "p-23", "p-26"]);
const UNMEASURED = new Set(["p-28", "p-29", "p-30"]);

const CARTONS = [
  { id: "S", costSar: 0.9 },
  { id: "FLAT", costSar: 1.1 },
  { id: "M", costSar: 1.6 },
  { id: "L", costSar: 2.6 },
  { id: "XL", costSar: 3.8 },
];

/**
 * How an order's story ends.
 * done*: the employee confirmed packing (after an edit, a measurement, or a failed product read).
 * ready: a carton was chosen, waiting for confirmation. new: never prepared.
 * The rest leave the order needing attention for that reason.
 */
type Story =
  | "done"
  | "done_edited"
  | "done_measured"
  | "done_after_failure"
  | "ready"
  | "needs_measurement"
  | "split"
  | "no_box"
  | "error"
  | "new";

const FAILURES: Array<{ status: ExtractionEvent["status"]; code: string; message: string; ms: number }> = [
  { status: "rate_limited", code: "429", message: "RESOURCE_EXHAUSTED: quota per minute exceeded", ms: 420 },
  { status: "timeout", code: "deadline", message: "no response within 12 s", ms: 12000 },
  { status: "api_error", code: "503", message: "UNAVAILABLE: the model is overloaded", ms: 1900 },
  { status: "parse_error", code: "schema", message: "response did not match the facts schema", ms: 3100 },
  { status: "blocked", code: "SAFETY", message: "finishReason SAFETY", ms: 2300 },
  { status: "empty", code: "no_candidates", message: "response had no candidates", ms: 2600 },
  { status: "config_error", code: "400", message: "API key not valid", ms: 300 },
  { status: "simulated_outage", code: "simulated", message: "simulated outage (demo fault injection)", ms: 150 },
];

/** Small seeded generator (mulberry32), so the mock story is identical on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMockData(nowMs: number, opts: { promptVersion: string; engineVersion: string; model?: string }): MockData {
  const rand = rng(20261021);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.round(between(lo, hi));
  let seq = 0;
  const id = () => `${MOCK_ID_PREFIX}${(++seq).toString(16).padStart(12, "0")}`;
  const iso = (minutesAgo: number) => new Date(nowMs - minutesAgo * 60_000).toISOString();

  const out: MockData = { orders: [], runs: [], extractions: [], corrections: [] };
  let failureTurn = 0;

  // [order id, template, story, minutes ago the story ends]. The newest entries drive the open alerts.
  const plan: Array<[string, string, Story, number]> = [
    // The last hour: a handful of runs, too few for any metric to be judged on its own.
    ["9023", "electronics", "ready", 8],
    ["9025", "gift", "needs_measurement", 14],
    ["9027", "heavy", "split", 22],
    ["9024", "basket", "ready", 35],
    ["9029", "book", "error", 47],
    // The last 24 hours.
    ["9028", "heavy", "no_box", 70],
    ["9026", "unnamed", "needs_measurement", 95],
    ["9022", "coffee", "done_edited", 130],
    ["9021", "fragileHeavy", "done", 170],
    ["9020", "perfume", "done_after_failure", 210],
    ["9019", "unnamed", "done_measured", 260],
    ["9018", "gift", "done_measured", 320],
    ["9017", "oils", "done", 380],
    ["9016", "phone", "done_after_failure", 450],
    ["9015", "basket", "done", 520],
    ["9014", "stationery", "done_after_failure", 600],
    ["9013", "perfumes", "done_edited", 690],
    ["9012", "plates", "done", 780],
    ["9011", "bottle", "done_after_failure", 870],
    ["9010", "dryer", "done", 960],
    ["9009", "coffee", "done_after_failure", 1050],
    ["9008", "gift", "done_measured", 1140],
    ["9007", "mugs", "done_edited", 1230],
    ["9006", "flat", "done", 1320],
    // Earlier this week.
    ["9005", "electronics", "done", 1600],
    ["9004", "fragileHeavy", "done_after_failure", 2000],
    ["9003", "liquids", "done", 2500],
    ["9002", "perfume", "done_edited", 3100],
    ["9001", "book", "done", 3700],
  ];
  // A steady background of finished orders over the past two weeks.
  const background = Object.keys(TEMPLATES).filter((k) => !["gift", "unnamed", "heavy"].includes(k));
  for (let i = 0; i < 34; i++) {
    const minutes = 4300 + i * 480 + int(0, 200); // ≈ 3 days to ≈ 14 days ago
    const story: Story = i % 9 === 4 ? "done_edited" : i % 7 === 2 ? "done_after_failure" : i % 11 === 6 ? "done_measured" : "done";
    const template = story === "done_measured" ? (i % 2 ? "gift" : "unnamed") : background[i % background.length];
    plan.push([String(9032 + i), template, story, minutes]);
  }
  plan.push(["9030", "liquids", "new", 25], ["9031", "bottle", "new", 300]);

  const validatorOrder = "9041"; // one validated-layout rejection, about three days ago
  const slowOrders = new Set(["9046", "9052"]); // slow product reads, five to six days ago

  for (const [orderId, key, story, endMinutes] of plan) {
    const t = TEMPLATES[key];
    const products = [...new Set(t.lines.map((l) => l.productId))];
    const unitCount = t.lines.reduce((s, l) => s + l.qty, 0);
    const chainGap = int(6, 40); // minutes between two runs of the same order
    const steps: Array<{ status: RunStatus; action: OrderRun["employeeAction"]; read: "none" | "ok" | "fail"; measured: boolean; edit: boolean; errorCode?: string }> = [];
    switch (story) {
      case "done":
        steps.push({ status: "box_found", action: "confirmed", read: rand() < 0.3 ? "ok" : "none", measured: false, edit: false });
        break;
      case "done_edited":
        steps.push({ status: "box_found", action: "edited", read: "ok", measured: false, edit: true });
        steps.push({ status: "box_found", action: "confirmed", read: "none", measured: false, edit: false });
        break;
      case "done_measured":
        steps.push({ status: "needs_measurement", action: "pending", read: "ok", measured: false, edit: false });
        steps.push({ status: "box_found", action: "confirmed", read: "none", measured: true, edit: false });
        break;
      case "done_after_failure":
        steps.push({ status: "needs_measurement", action: "pending", read: "fail", measured: false, edit: false });
        steps.push({ status: "box_found", action: "confirmed", read: "ok", measured: false, edit: false });
        break;
      case "ready":
        steps.push({ status: "box_found", action: "pending", read: rand() < 0.5 ? "ok" : "none", measured: false, edit: false });
        break;
      case "needs_measurement":
        steps.push({ status: "needs_measurement", action: "pending", read: "ok", measured: false, edit: false });
        break;
      case "split":
      case "no_box":
        steps.push({ status: "no_box", action: "pending", read: "none", measured: false, edit: false });
        steps.push({ status: "no_box", action: "pending", read: "none", measured: false, edit: false });
        break;
      case "error":
        steps.push({ status: "error", action: "pending", read: "none", measured: false, edit: false, errorCode: "store_unreachable" });
        break;
      case "new":
        break;
    }

    const firstMinutes = endMinutes + chainGap * Math.max(0, steps.length - 1) + 3;
    out.orders.push({ id: orderId, expect: `${story} · ${TEMPLATES[key].twin}`, lines: t.lines.map((l) => ({ ...l })), createdAt: iso(firstMinutes + 2) });

    steps.forEach((step, i) => {
      const minutesAgo = endMinutes + chainGap * (steps.length - 1 - i);
      const at = iso(minutesAgo);
      const runId = id();
      const readProduct = products[int(0, products.length - 1)];
      const misses = step.read === "none" ? [] : [readProduct];

      // Product reads for this run (cache misses).
      let extractMs = 0;
      let costUsd = 0;
      let tokens = 0;
      const failed = new Set<string>();
      for (const p of misses) {
        if (step.read === "fail") {
          const f = FAILURES[failureTurn++ % FAILURES.length];
          failed.add(p);
          extractMs = Math.max(extractMs, f.ms);
          out.extractions.push(event(runId, p, at, f.status, f.ms, 0, 0, 0, f.code, f.message));
        } else {
          const ms = slowOrders.has(orderId) ? int(9200, 11800) : int(1700, 6400);
          const input = int(950, 1450);
          const output = int(110, 230);
          const thinking = int(0, 260);
          const cost = input * 0.3e-6 + (output + thinking) * 2.5e-6;
          extractMs = Math.max(extractMs, ms);
          costUsd += cost;
          tokens += input + output + thinking;
          out.extractions.push(event(runId, p, at, "ok", ms, input, output, thinking, null, null));
        }
      }

      // Where each unit's measurements came from in this run.
      const unitSources: Record<DataSource, number> = { page: 0, inferred: 0, manual: 0, unknown: 0 };
      for (const l of t.lines) {
        const src: DataSource = failed.has(l.productId)
          ? "unknown"
          : UNMEASURED.has(l.productId)
            ? step.measured || step.status === "box_found"
              ? "manual"
              : "unknown"
            : INFERRED.has(l.productId)
              ? "inferred"
              : "page";
        unitSources[src] += l.qty;
      }
      const aiProducts = products.filter((p) => !UNMEASURED.has(p) && !failed.has(p));
      const stopped = step.status === "error"; // the store did not answer, so the order's items were never read
      if (stopped) unitSources.page = unitSources.inferred = unitSources.manual = unitSources.unknown = 0;

      const packMs = step.status === "needs_measurement" || step.status === "error" ? int(2, 12) : int(45, 420);
      const overhead = int(60, 260);
      let totalMs = extractMs + packMs + overhead;
      if (orderId === "9047" && i === steps.length - 1) totalMs = 2150; // one slow cached run, five days ago

      const isSplit = story === "split";
      const attempts = cartonAttempts(step.status, t.carton, orderId === validatorOrder);
      const carton = step.status === "box_found" ? t.carton : null;
      const cartonCost = CARTONS.find((c) => c.id === carton)?.costSar ?? null;
      const shipping = step.status === "box_found" ? Math.round((18 + 3 * Math.ceil(unitCount * 0.6)) * 100) / 100 : null;
      const actionAt = step.action === "pending" ? null : iso(minutesAgo - int(1, 5));

      out.runs.push({
        id: runId,
        createdAt: at,
        trigger: "order",
        orderId,
        status: step.status,
        cartonId: carton,
        strategy: step.status === "box_found" ? ["volume", "base_area", "weight", "volume_base_first"][int(0, 3)] : isSplit ? "split_2" : null,
        itemsCount: stopped ? 0 : unitCount,
        cacheHits: stopped ? 0 : products.length - misses.length,
        cacheMisses: misses.length,
        estimatedUnits: unitSources.inferred,
        unitSources,
        aiProducts: stopped ? [] : aiProducts,
        extractMs,
        packMs,
        totalMs,
        candidatesChecked: step.status === "box_found" || step.status === "no_box" ? int(40, 900) : 0,
        attempts,
        validatorRejections: orderId === validatorOrder && i === steps.length - 1 ? 1 : 0,
        violations:
          orderId === validatorOrder && i === steps.length - 1
            ? [{ code: "on_fragile", unitId: `${t.lines[0].productId}#1`, cartonId: "M", detail: "a heavier item was placed on a fragile one" }]
            : [],
        cartonCostSar: cartonCost,
        shippingSar: shipping,
        totalSar: isSplit ? 61.4 : cartonCost !== null && shipping !== null ? Math.round((cartonCost + shipping) * 100) / 100 : null,
        tokensTotal: tokens,
        costUsd,
        engineVersion: opts.engineVersion,
        promptVersion: opts.promptVersion,
        monitoringDegraded: false,
        errorCode: step.errorCode ?? null,
        employeeAction: step.action,
        actionAt,
      });

      if (step.edit) {
        // The packer corrected what Rassah read: one product, one or two fields.
        const p = aiProducts[int(0, aiProducts.length - 1)] ?? products[0];
        const fields: Array<[string, string, string]> = [
          ["height_cm", String(int(8, 20)), String(int(21, 30))],
          ["weight_g", String(int(200, 500)), String(int(520, 900))],
          ["length_cm", String(int(10, 18)), String(int(19, 26))],
          ["fragile", "false", "true"],
          ["width_cm", String(int(6, 10)), String(int(11, 15))],
        ];
        const pick = int(0, fields.length - 1);
        const chosen = rand() < 0.5 ? [fields[pick]] : [fields[pick], fields[(pick + 1) % fields.length]];
        for (const [field, oldValue, newValue] of chosen) {
          out.corrections.push({ id: id(), createdAt: iso(minutesAgo - 1), runId, productId: p, field, oldValue, newValue, priorOrigin: "ai" });
        }
      }
      if (step.measured) {
        // Measuring an unmeasured product is recorded as a correction from "no data".
        const p = products.find((x) => UNMEASURED.has(x)) ?? products[0];
        out.corrections.push({ id: id(), createdAt: iso(minutesAgo + 1), runId: null, productId: p, field: "height_cm", oldValue: null, newValue: String(int(12, 30)), priorOrigin: "none" });
      }
    });
  }

  // Order numbers typed wrong at the packing station: saved as error runs, no order behind them.
  for (const [orderId, minutes] of [["9100", 260], ["90012", 2900]] as const) {
    out.runs.push({
      ...out.runs[0],
      id: id(),
      createdAt: iso(minutes),
      orderId,
      status: "error",
      cartonId: null,
      strategy: null,
      itemsCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      estimatedUnits: 0,
      unitSources: { page: 0, inferred: 0, manual: 0, unknown: 0 },
      aiProducts: [],
      extractMs: 0,
      packMs: 0,
      totalMs: int(20, 90),
      candidatesChecked: 0,
      attempts: [],
      validatorRejections: 0,
      violations: [],
      cartonCostSar: null,
      shippingSar: null,
      totalSar: null,
      tokensTotal: 0,
      costUsd: 0,
      errorCode: "order_not_found",
      employeeAction: "pending",
      actionAt: null,
    });
  }

  // Re-reads started from the products page (no order run behind them).
  for (const [p, minutes] of [["p-07", 400], ["p-12", 5200], ["p-21", 9000]] as const) {
    out.extractions.push({ ...event(null, p, iso(minutes), "ok", int(2000, 4800), 1200, 160, 90, null, null), trigger: "admin" });
  }

  return out;

  function event(
    runId: string | null,
    productId: string,
    at: string,
    status: ExtractionEvent["status"],
    latencyMs: number,
    inputTokens: number,
    outputTokens: number,
    thinkingTokens: number,
    errorCode: string | null,
    errorMessage: string | null,
  ): ExtractionEvent {
    const ok = status === "ok";
    const src: DataSource | null = ok ? (INFERRED.has(productId) ? "inferred" : UNMEASURED.has(productId) ? "unknown" : "page") : null;
    return {
      id: id(),
      createdAt: at,
      runId,
      trigger: "order",
      productId,
      status,
      latencyMs,
      inputTokens,
      outputTokens,
      thinkingTokens,
      costUsd: ok ? inputTokens * 0.3e-6 + (outputTokens + thinkingTokens) * 2.5e-6 : 0,
      model: opts.model ?? null,
      promptVersion: opts.promptVersion,
      dimsSource: src,
      weightSource: src,
      confidence: ok ? (src === "page" ? "high" : src === "inferred" ? "medium" : "low") : null,
      fragile: ok ? false : null,
      liquid: ok ? false : null,
      errorCode,
      errorMessage,
    };
  }

  /** One attempt per carton, cheapest first: smaller ones skipped for a reason, the chosen one packed. */
  function cartonAttempts(status: RunStatus, chosen: string | null, validatorReject: boolean): CartonAttempt[] {
    if (status === "needs_measurement" || status === "error") return [];
    const order = [...CARTONS].sort((a, b) => a.costSar - b.costSar);
    if (status === "no_box") {
      return order.map((c) => ({ cartonId: c.id, outcome: c.id === "XL" || c.id === "L" ? "overweight" : "oversize", strategy: null }));
    }
    const idx = order.findIndex((c) => c.id === chosen);
    return order.map((c, i) => {
      if (i < idx) {
        const outcome: CartonAttempt["outcome"] = validatorReject && i === idx - 1 ? "validator_rejected" : c.id === "FLAT" || c.id === "S" ? "oversize" : rand() < 0.3 ? "search_budget" : "no_layout";
        return { cartonId: c.id, outcome, strategy: null };
      }
      return i === idx ? { cartonId: c.id, outcome: "packed", strategy: "volume" } : { cartonId: c.id, outcome: "not_needed", strategy: null };
    });
  }
}

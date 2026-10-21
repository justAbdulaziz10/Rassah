import { describe, expect, it } from "vitest";
import type { OrderRun, OrderSummary, StoredFacts } from "@/lib/db/types";
import { buildQueue, countQueue, needsMeasuring, nextOrder, sortQueue } from "@/lib/orders/queue";

function order(id: string, productIds: string[] = ["p-01"]): OrderSummary {
  return { id, demo: null, expect: null, customerName: null, createdAt: null, lineCount: productIds.length, unitCount: productIds.length, productIds };
}

function run(orderId: string, at: string, over: Partial<OrderRun> = {}): OrderRun {
  return {
    id: `${orderId}-${at}`,
    createdAt: at,
    trigger: "order",
    orderId,
    status: "box_found",
    cartonId: "M",
    strategy: null,
    itemsCount: 1,
    cacheHits: 1,
    cacheMisses: 0,
    estimatedUnits: 0,
    unitSources: { page: 1, inferred: 0, manual: 0, unknown: 0 },
    aiProducts: [],
    extractMs: 0,
    packMs: 1,
    totalMs: 1,
    candidatesChecked: 1,
    attempts: [],
    validatorRejections: 0,
    violations: [],
    cartonCostSar: 1,
    shippingSar: 1,
    totalSar: 2,
    tokensTotal: 0,
    costUsd: 0,
    engineVersion: "test",
    promptVersion: "test",
    monitoringDegraded: false,
    errorCode: null,
    employeeAction: "pending",
    actionAt: null,
    ...over,
  };
}

function facts(productId: string, over: Partial<StoredFacts> = {}): StoredFacts {
  return {
    productId,
    lengthCm: 10,
    widthCm: 10,
    heightCm: 10,
    weightG: 100,
    dimsSource: "page",
    weightSource: "page",
    fragile: false,
    liquid: false,
    sensitive: false,
    confidence: "high",
    evidence: null,
    origin: "ai",
    sourceHash: "h",
    model: null,
    promptVersion: null,
    extractedAt: null,
    updatedAt: "2026-10-21T00:00:00Z",
    ...over,
  };
}

const noFacts = new Map<string, StoredFacts>();

describe("order queue", () => {
  it("an order nobody prepared is new", () => {
    const [e] = buildQueue([order("1001")], [], noFacts);
    expect(e).toMatchObject({ state: "new", reason: null, lastPreparedAt: null });
  });

  it("a prepared but unconfirmed order waits for confirmation", () => {
    const [e] = buildQueue([order("1001")], [run("1001", "2026-10-21T10:00:00Z")], noFacts);
    expect(e.state).toBe("ready");
  });

  it("any confirmed run marks the order done, even if it was prepared again afterwards", () => {
    const runs = [
      run("1001", "2026-10-21T10:00:00Z", { employeeAction: "confirmed", actionAt: "2026-10-21T10:01:00Z" }),
      run("1001", "2026-10-21T11:00:00Z"),
    ];
    const [e] = buildQueue([order("1001")], runs, noFacts);
    expect(e).toMatchObject({ state: "done", confirmedAt: "2026-10-21T10:01:00Z", lastPreparedAt: "2026-10-21T11:00:00Z" });
  });

  it("the latest attempt decides: a failure after a success needs attention, a success after a failure is ready", () => {
    const failedLast = [run("1001", "2026-10-21T10:00:00Z"), run("1001", "2026-10-21T11:00:00Z", { status: "no_box" })];
    expect(buildQueue([order("1001")], failedLast, noFacts)[0]).toMatchObject({ state: "attention", reason: "no_box" });
    const fixedLast = [run("1001", "2026-10-21T10:00:00Z", { status: "needs_measurement" }), run("1001", "2026-10-21T11:00:00Z")];
    expect(buildQueue([order("1001")], fixedLast, noFacts)[0].state).toBe("ready");
  });

  it("an order Rassah split into several cartons needs attention with its own reason", () => {
    const runs = [run("1020", "2026-10-21T10:00:00Z", { status: "no_box", strategy: "split_2" })];
    expect(buildQueue([order("1020")], runs, noFacts)[0]).toMatchObject({ state: "attention", reason: "split" });
  });

  it("ignores evaluation runs and runs of other orders", () => {
    const runs = [run("1001", "2026-10-21T10:00:00Z", { trigger: "eval", employeeAction: "confirmed" }), run("1002", "2026-10-21T10:00:00Z")];
    expect(buildQueue([order("1001")], runs, noFacts)[0].state).toBe("new");
  });

  it("flags a never-prepared order whose saved facts already say a product must be measured", () => {
    const f = new Map([["p-28", facts("p-28", { lengthCm: null, dimsSource: "unknown" })]]);
    const [e] = buildQueue([order("1006", ["p-01", "p-28"])], [], f);
    expect(e).toMatchObject({ state: "attention", reason: "needs_measurement", unmeasured: ["p-28"] });
  });

  it("needsMeasuring follows the engine rule and leaves unread products alone", () => {
    expect(needsMeasuring(undefined)).toBe(false);
    expect(needsMeasuring(facts("a"))).toBe(false);
    expect(needsMeasuring(facts("a", { weightSource: "unknown" }))).toBe(true);
    expect(needsMeasuring(facts("a", { weightG: 0 }))).toBe(true);
  });

  it("sorts problems first, then new, then waiting, then done, by order number", () => {
    const entries = buildQueue(
      [order("1003"), order("1010"), order("1002"), order("1001")],
      [
        run("1001", "2026-10-21T10:00:00Z", { employeeAction: "confirmed" }),
        run("1002", "2026-10-21T10:00:00Z"),
        run("1010", "2026-10-21T10:00:00Z", { status: "error" }),
      ],
      noFacts,
    );
    expect(sortQueue(entries).map((e) => e.order.id)).toEqual(["1010", "1003", "1002", "1001"]);
    expect(countQueue(entries)).toEqual({ new: 1, ready: 1, attention: 1, done: 1, remaining: 3, total: 4 });
    expect(nextOrder(entries, "1010")).toBe("1003");
    expect(nextOrder(entries.filter((e) => e.state === "done"), "1001")).toBeNull();
  });
});

describe("buildQueue: store orders", () => {
  it("ignores runs saved for the number before the store order was placed", () => {
    const store: OrderSummary = { ...order("5001"), customerName: "سارة", createdAt: "2026-10-21T12:00:00Z" };
    const seeded = order("1001");
    const runs = [
      run("5001", "2026-10-21T11:00:00Z", { status: "error" }), // someone typed 5001 before it existed
      run("5001", "2026-10-21T10:00:00Z", { employeeAction: "confirmed" }),
      run("1001", "2026-10-21T11:00:00Z", { status: "error" }),
    ];
    const q = buildQueue([store, seeded], runs, new Map());
    expect(q.find((e) => e.order.id === "5001")).toMatchObject({ state: "new", lastPreparedAt: null });
    expect(q.find((e) => e.order.id === "1001")).toMatchObject({ state: "attention", reason: "error" });

    const later = buildQueue([store], [...runs, run("5001", "2026-10-21T12:05:00Z")], new Map());
    expect(later[0]).toMatchObject({ state: "ready", lastPreparedAt: "2026-10-21T12:05:00Z" });
  });
});

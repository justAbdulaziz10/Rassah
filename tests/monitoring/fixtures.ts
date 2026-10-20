import type { Correction, ExtractionEvent, OrderRun } from "@/lib/db/types";

let seq = 0;
const at = (minutesAgo: number, nowMs: number) => new Date(nowMs - minutesAgo * 60_000).toISOString();
export const NOW = Date.parse("2026-10-21T12:00:00Z");

export function run(over: Partial<OrderRun> & { minutesAgo?: number } = {}): OrderRun {
  const { minutesAgo = 5, ...rest } = over;
  return {
    id: `run-${++seq}`,
    createdAt: at(minutesAgo, NOW),
    trigger: "order",
    orderId: "1001",
    status: "box_found",
    cartonId: "M",
    strategy: "volume",
    itemsCount: 2,
    cacheHits: 2,
    cacheMisses: 0,
    estimatedUnits: 0,
    unitSources: { page: 2, inferred: 0, manual: 0, unknown: 0 },
    aiProducts: [],
    extractMs: 0,
    packMs: 20,
    totalMs: 300,
    candidatesChecked: 100,
    attempts: [{ cartonId: "M", outcome: "packed", strategy: "volume" }],
    validatorRejections: 0,
    violations: [],
    cartonCostSar: 1.6,
    shippingSar: 24,
    totalSar: 25.6,
    tokensTotal: 0,
    costUsd: 0,
    engineVersion: "engine-0.1",
    promptVersion: "v1",
    monitoringDegraded: false,
    errorCode: null,
    employeeAction: "pending",
    actionAt: null,
    ...rest,
  };
}

export function extraction(over: Partial<ExtractionEvent> & { minutesAgo?: number } = {}): ExtractionEvent {
  const { minutesAgo = 5, ...rest } = over;
  return {
    id: `ex-${++seq}`,
    createdAt: at(minutesAgo, NOW),
    runId: null,
    trigger: "order",
    productId: "p-01",
    status: "ok",
    latencyMs: 1500,
    inputTokens: 500,
    outputTokens: 100,
    thinkingTokens: 0,
    costUsd: 0.0004,
    model: "m",
    promptVersion: "v1",
    dimsSource: "page",
    weightSource: "page",
    confidence: "high",
    fragile: false,
    liquid: false,
    errorCode: null,
    errorMessage: null,
    ...rest,
  };
}

export function correction(productId: string, field = "height_cm", priorOrigin: Correction["priorOrigin"] = "ai"): Correction {
  return { id: `c-${++seq}`, createdAt: at(1, NOW), runId: null, productId, field, oldValue: "10", newValue: "12", priorOrigin };
}

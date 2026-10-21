import { describe, expect, it } from "vitest";
import { buildMockData, MOCK_ID_PREFIX } from "@/lib/demo/mock-data";
import { evaluateRules } from "@/lib/monitoring/alerts";
import { computeMetrics } from "@/lib/monitoring/metrics";
import { buildQueue } from "@/lib/orders/queue";

const NOW = Date.parse("2026-10-21T09:00:00Z");
const data = buildMockData(NOW, { promptVersion: "v1", engineVersion: "engine-0.3", model: "gemini-test" });

describe("mock demo history", () => {
  it("is deterministic and ends before now", () => {
    expect(buildMockData(NOW, { promptVersion: "v1", engineVersion: "engine-0.3", model: "gemini-test" })).toEqual(data);
    const times = [...data.runs, ...data.extractions, ...data.corrections].map((r) => Date.parse(r.createdAt!));
    expect(Math.max(...times)).toBeLessThanOrEqual(NOW);
  });

  it("tags every row so it can be removed exactly", () => {
    const ids = [...data.runs, ...data.extractions, ...data.corrections].map((r) => r.id!);
    expect(ids.every((id) => id.startsWith(MOCK_ID_PREFIX) && /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.orders.every((o) => Number(o.id) >= 9001)).toBe(true);
  });

  it("every run and correction belongs to a mock order or a mistyped number", () => {
    const orderIds = new Set(data.orders.map((o) => o.id));
    const runIds = new Set(data.runs.map((r) => r.id));
    expect(data.runs.filter((r) => !orderIds.has(r.orderId)).map((r) => r.errorCode)).toEqual(["order_not_found", "order_not_found"]);
    expect(data.extractions.every((e) => e.runId === null || runIds.has(e.runId))).toBe(true);
    expect(data.corrections.every((c) => c.runId === null || runIds.has(c.runId))).toBe(true);
  });

  it("covers every run status, employee action and product read status", () => {
    expect(new Set(data.runs.map((r) => r.status))).toEqual(new Set(["box_found", "no_box", "needs_measurement", "error"]));
    expect(new Set(data.runs.map((r) => r.employeeAction))).toEqual(new Set(["pending", "confirmed", "edited"]));
    expect(new Set(data.extractions.map((e) => e.status))).toEqual(
      new Set(["ok", "parse_error", "api_error", "rate_limited", "timeout", "blocked", "empty", "config_error", "simulated_outage"]),
    );
    expect(new Set(data.runs.flatMap((r) => r.attempts.map((a) => a.outcome)))).toEqual(
      new Set(["packed", "oversize", "overweight", "search_budget", "no_layout", "validator_rejected", "not_needed"]),
    );
    expect(data.runs.some((r) => r.strategy?.startsWith("split_"))).toBe(true);
    expect(data.extractions.some((e) => e.trigger === "admin")).toBe(true);
  });

  it("puts orders in every queue state", () => {
    const summaries = data.orders.map((o) => ({
      id: o.id,
      customerName: null,
      createdAt: o.createdAt,
      unitCount: o.lines.reduce((s, l) => s + l.qty, 0),
      productIds: [...new Set(o.lines.map((l) => l.productId))],
    }));
    const queue = buildQueue(summaries, data.runs, new Map());
    expect(new Set(queue.map((e) => e.state))).toEqual(new Set(["new", "ready", "attention", "done"]));
    expect(new Set(queue.map((e) => e.reason).filter(Boolean))).toEqual(new Set(["needs_measurement", "no_box", "split", "error"]));
  });

  it("breaks the alert rules the demo shows, and only those", () => {
    // The app evaluates the rules over the last 7 days (refreshAlerts).
    const from = new Date(NOW - 7 * 24 * 3600_000).toISOString();
    const keep = <T extends { createdAt?: string }>(rows: T[]) => rows.filter((r) => r.createdAt! >= from);
    const week = { runs: keep(data.runs), extractions: keep(data.extractions), corrections: keep(data.corrections) };
    const breached = evaluateRules({ ...week, nowMs: NOW }).filter((e) => e.breached).map((e) => e.rule).sort();
    expect(breached).toEqual(["M1_correction_rate", "M4_no_box_rate", "M5_latency_p95", "M6_gemini_failure_rate"]);
  });

  it("has too few cases in the last hour and enough in the last 24 hours", () => {
    const since = (ms: number) => {
      const from = new Date(NOW - ms).toISOString();
      const keep = <T extends { createdAt?: string }>(rows: T[]) => rows.filter((r) => r.createdAt! >= from);
      return computeMetrics({ runs: keep(data.runs), extractions: keep(data.extractions), corrections: keep(data.corrections) });
    };
    const hour = since(3600_000);
    const day = since(24 * 3600_000);
    expect(hour.m4NoBoxRate.sufficient).toBe(false);
    expect(day.m4NoBoxRate.sufficient).toBe(true);
    // The default 24 h view agrees with the open alerts: corrections and slow reads are over their limits.
    expect(day.m1CorrectionRate.value).toBeGreaterThan(0.2);
    expect(day.m5Latency.uncached.value.p95).toBeGreaterThan(8000);
    expect(day.m4NoBoxRate.value).toBeGreaterThan(0.15);
    expect(day.m6GeminiFailureRate.value).toBeGreaterThan(0.1);
  });
});

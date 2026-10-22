import { describe, expect, it } from "vitest";
import { percentile } from "@/lib/math";
import { computeMetrics, latencySeries, windowSince } from "@/lib/monitoring/metrics";
import { correction, extraction, NOW, run } from "./fixtures";

describe("percentile (nearest rank)", () => {
  it("handles empty, single and typical inputs", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });
});

describe("windowSince", () => {
  it("returns an ISO cutoff or null for 'all'", () => {
    expect(windowSince("1h", NOW)).toBe("2026-10-21T11:00:00.000Z");
    expect(windowSince("all", NOW)).toBeNull();
  });
});

describe("latencySeries", () => {
  it("leaves out error and eval runs, so the chart counts what M5 counts", () => {
    const runs = [run({ totalMs: 300 }), run({ cacheMisses: 1, totalMs: 3000 }), run({ status: "error", totalMs: 5, orderId: "99999" }), run({ trigger: "eval" })];
    const points = latencySeries(runs);
    expect(points.map((p) => p.totalMs)).toEqual([300, 3000]);
    const m5 = computeMetrics({ runs, extractions: [], corrections: [] }).m5Latency;
    expect(points).toHaveLength(m5.cached.n + m5.uncached.n);
  });
});

describe("computeMetrics", () => {
  it("M1: correction rate over reviewed AI products only", () => {
    const runs = [
      run({ employeeAction: "confirmed", aiProducts: ["p-01", "p-02"] }),
      run({ employeeAction: "edited", aiProducts: ["p-03"] }),
      run({ employeeAction: "pending", aiProducts: ["p-04"] }), // not reviewed yet
    ];
    const m = computeMetrics({
      runs,
      extractions: [],
      corrections: [correction("p-03"), correction("p-03", "fragile"), correction("p-04"), correction("p-01", "x", "manual")],
    });
    expect(m.m1CorrectionRate).toMatchObject({ value: 1 / 3, reviewed: 3, corrected: 1, n: 3, sufficient: false });
    expect(m.m1CorrectionRate.byField).toEqual({ height_cm: 1, fragile: 1 });
  });

  it("M2: source mix and unknown share", () => {
    const m = computeMetrics({
      runs: [
        run({ unitSources: { page: 6, inferred: 3, manual: 0, unknown: 1 } }),
        run({ unitSources: { page: 0, inferred: 0, manual: 1, unknown: 1 } }),
      ],
      extractions: [],
      corrections: [],
    });
    expect(m.m2SourceMix.value).toEqual({ page: 6, inferred: 3, manual: 1, unknown: 2 });
    expect(m.m2SourceMix.unknownShare).toBeCloseTo(2 / 12);
    expect(m.m2SourceMix.sufficient).toBe(true);
  });

  it("M3: validator rejections and violation codes", () => {
    const m = computeMetrics({
      runs: [run(), run({ validatorRejections: 1, violations: [{ code: "floating", unitId: "a#1", cartonId: "M", detail: "" }] })],
      extractions: [],
      corrections: [],
    });
    expect(m.m3ValidatorRejections.value).toBe(1);
    expect(m.m3ValidatorRejections.byCode).toEqual({ floating: 1 });
  });

  it("M4: no-box rate over runs that reached packing, with skip reasons", () => {
    const m = computeMetrics({
      runs: [
        run(),
        run({ status: "no_box", attempts: [{ cartonId: "S", outcome: "oversize", strategy: null }, { cartonId: "XL", outcome: "overweight", strategy: null }] }),
        run({ status: "needs_measurement" }), // never reached packing
      ],
      extractions: [],
      corrections: [],
    });
    expect(m.m4NoBoxRate.value).toBe(0.5);
    expect(m.m4NoBoxRate.n).toBe(2);
    expect(m.m4NoBoxRate.skipReasons).toEqual({ oversize: 1, overweight: 1 });
  });

  it("M5: latency split by cached vs uncached", () => {
    const m = computeMetrics({
      // 5 ms error runs (unknown order number) must not count as fast cached orders.
      runs: [run({ totalMs: 200 }), run({ totalMs: 400 }), run({ cacheMisses: 1, totalMs: 3000 }), run({ status: "error", totalMs: 5 }), run({ status: "error", totalMs: 5 })],
      extractions: [],
      corrections: [],
    });
    expect(m.m5Latency.cached.value).toEqual({ p50: 200, p95: 400 });
    expect(m.m5Latency.uncached.value).toEqual({ p50: 3000, p95: 3000 });
  });

  it("M5: the overall median spans known and new products, without error runs", () => {
    const runs = [
      run({ totalMs: 200 }),
      run({ cacheMisses: 1, totalMs: 3000 }),
      run({ cacheMisses: 1, totalMs: 4000 }),
      run({ status: "error", totalMs: 5 }),
      run({ status: "error", totalMs: 5 }),
    ];
    const m = computeMetrics({ runs, extractions: [], corrections: [] });
    expect(m.m5Latency.cached.value.p50).toBe(200);
    expect(m.m5Latency.overallP50).toBe(3000);
    expect(computeMetrics({ runs: [], extractions: [], corrections: [] }).m5Latency.overallP50).toBeNull();
  });

  it("M6: Gemini failure rate with breakdown, excluding eval traffic", () => {
    const m = computeMetrics({
      runs: [],
      extractions: [
        extraction(),
        extraction(),
        extraction({ status: "rate_limited" }),
        extraction({ status: "parse_error" }),
        extraction({ status: "api_error", trigger: "eval" }), // excluded
      ],
      corrections: [],
    });
    expect(m.m6GeminiFailureRate.value).toBe(0.5);
    expect(m.m6GeminiFailureRate.byStatus).toEqual({ ok: 2, rate_limited: 1, parse_error: 1 });
  });

  it("M7: cost per order and cache-hit rate", () => {
    const m = computeMetrics({
      runs: [run({ costUsd: 0.002, cacheHits: 1, cacheMisses: 1 }), run({ costUsd: 0, cacheHits: 2, cacheMisses: 0 })],
      extractions: [],
      corrections: [],
    });
    expect(m.m7Cost.value).toBeCloseTo(0.001);
    expect(m.m7Cost.cacheHitRate).toBeCloseTo(0.75);
  });

  it("marks metrics below their minimum sample as insufficient", () => {
    const m = computeMetrics({ runs: [run()], extractions: [], corrections: [] });
    expect(m.m4NoBoxRate.sufficient).toBe(false);
    expect(m.m7Cost.sufficient).toBe(false);
    expect(m.m3ValidatorRejections.sufficient).toBe(true); // any single rejection matters
  });

  it("excludes eval runs everywhere", () => {
    const m = computeMetrics({ runs: [run({ trigger: "eval", validatorRejections: 5 })], extractions: [], corrections: [] });
    expect(m.m3ValidatorRejections.value).toBe(0);
    expect(m.m3ValidatorRejections.n).toBe(0);
  });
});

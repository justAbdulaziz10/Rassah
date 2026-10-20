import { describe, expect, it, vi } from "vitest";
import { evaluateRules, syncAlerts, THRESHOLDS } from "@/lib/monitoring/alerts";
import { MemoryRepo } from "../fakes/memory-repo";
import { correction, extraction, NOW, run } from "./fixtures";

const rule = (evals: ReturnType<typeof evaluateRules>, name: string) => evals.find((e) => e.rule === name)!;
const base = { runs: [], extractions: [], corrections: [], nowMs: NOW };

describe("evaluateRules", () => {
  it("M3 fires on any validator rejection in the last 24 h, not on older ones", () => {
    expect(rule(evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] }), "M3_validator_rejection").breached).toBe(true);
    expect(rule(evaluateRules({ ...base, runs: [run({ validatorRejections: 1, minutesAgo: 25 * 60 })] }), "M3_validator_rejection").breached).toBe(false);
  });

  it("M6 fires above 10% failures of the last 20, not at exactly 10%", () => {
    const tenPct = [...Array(18).fill(0).map(() => extraction()), extraction({ status: "api_error" }), extraction({ status: "api_error" })];
    expect(rule(evaluateRules({ ...base, extractions: tenPct }), "M6_gemini_failure_rate").breached).toBe(false);
    const above = [...Array(17).fill(0).map(() => extraction()), ...Array(3).fill(0).map(() => extraction({ status: "api_error" }))];
    expect(rule(evaluateRules({ ...base, extractions: above }), "M6_gemini_failure_rate").breached).toBe(true);
  });

  it("M6 respects the minimum sample and flags simulated outages", () => {
    const few = [extraction({ status: "simulated_outage" }), extraction({ status: "simulated_outage" })];
    expect(rule(evaluateRules({ ...base, extractions: few }), "M6_gemini_failure_rate").breached).toBe(false);
    const enough = [...Array(4).fill(0).map(() => extraction()), extraction({ status: "simulated_outage" })];
    const ev = rule(evaluateRules({ ...base, extractions: enough }), "M6_gemini_failure_rate");
    expect(ev.breached).toBe(true);
    expect(ev.simulated).toBe(true);
  });

  it("M1 fires when more than 20% of reviewed AI products were corrected", () => {
    const products = Array.from({ length: 10 }, (_, i) => `p-${i}`);
    const runs = [run({ employeeAction: "confirmed", aiProducts: products })];
    const two = [correction("p-0"), correction("p-1")];
    expect(rule(evaluateRules({ ...base, runs, corrections: two }), "M1_correction_rate").breached).toBe(false); // 20%
    const three = [...two, correction("p-2")];
    expect(rule(evaluateRules({ ...base, runs, corrections: three }), "M1_correction_rate").breached).toBe(true); // 30%
  });

  it("M5 fires when cached p95 exceeds the threshold", () => {
    const fast = Array.from({ length: 6 }, () => run({ totalMs: 300 }));
    expect(rule(evaluateRules({ ...base, runs: fast }), "M5_latency_p95").breached).toBe(false);
    const slow = Array.from({ length: 6 }, () => run({ totalMs: THRESHOLDS.m5CachedP95Ms + 1 }));
    expect(rule(evaluateRules({ ...base, runs: slow }), "M5_latency_p95").breached).toBe(true);
  });

  it("M4 fires above 15% no-box among the last runs that reached packing", () => {
    const runs = [...Array.from({ length: 8 }, () => run()), run({ status: "no_box" }), run({ status: "no_box" })];
    expect(rule(evaluateRules({ ...base, runs }), "M4_no_box_rate").breached).toBe(true); // 20%
  });

  it("M2 fires when more than 30% of units are unknown", () => {
    const runs = [run({ unitSources: { page: 6, inferred: 0, manual: 0, unknown: 4 } })];
    expect(rule(evaluateRules({ ...base, runs }), "M2_unknown_share").breached).toBe(true);
  });
});

describe("syncAlerts", () => {
  it("opens one alert per breached rule, deduplicates, and resolves on recovery", async () => {
    const repo = new MemoryRepo();
    const failing = evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] });
    await syncAlerts(repo, failing);
    await syncAlerts(repo, failing); // second evaluation must not duplicate
    expect((await repo.listOpenAlerts()).map((a) => a.rule)).toEqual(["M3_validator_rejection"]);

    const healthy = evaluateRules({ ...base, runs: [run()] });
    const open = await syncAlerts(repo, healthy);
    expect(open).toEqual([]);
    expect(repo.alerts[0].resolvedAt).not.toBeNull();
  });

  it("posts to the webhook for real alerts but not for simulated ones", async () => {
    const repo = new MemoryRepo();
    const fetchFn = vi.fn(async () => new Response("ok"));
    const simulated = [...Array(4).fill(0).map(() => extraction()), extraction({ status: "simulated_outage" })];
    await syncAlerts(repo, evaluateRules({ ...base, extractions: simulated }), { webhookUrl: "https://hook.example", fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();

    const real = [...Array(4).fill(0).map(() => extraction()), extraction({ status: "api_error" })];
    await repo.resolveAlert(repo.alerts[0].id!);
    await syncAlerts(repo, evaluateRules({ ...base, extractions: real }), { webhookUrl: "https://hook.example", fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

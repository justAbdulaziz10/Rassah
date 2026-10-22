import { describe, expect, it, vi } from "vitest";
import { evaluateRules, syncAlerts, THRESHOLDS } from "@/lib/monitoring/alerts";
import { MemoryRepo } from "@/lib/db/memory";
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
    const enough = [...Array(4).fill(0).map(() => extraction()), extraction({ status: "simulated_outage", minutesAgo: 1 })];
    const ev = rule(evaluateRules({ ...base, extractions: enough }), "M6_gemini_failure_rate");
    expect(ev.breached).toBe(true);
    expect(ev.simulated).toBe(true);
  });

  it("M6 clears a simulated outage on the first successful call, but real failures must age out", () => {
    const outage = Array.from({ length: 5 }, (_, i) => extraction({ status: "simulated_outage", minutesAgo: 10 + i }));
    const older = Array.from({ length: 10 }, () => extraction({ minutesAgo: 30 }));
    const recovered = [extraction({ minutesAgo: 1 }), ...outage, ...older];
    expect(rule(evaluateRules({ ...base, extractions: recovered }), "M6_gemini_failure_rate").breached).toBe(false);

    const real = Array.from({ length: 5 }, (_, i) => extraction({ status: "api_error", minutesAgo: 10 + i }));
    const stillFailing = [extraction({ minutesAgo: 1 }), ...real, ...older];
    expect(rule(evaluateRules({ ...base, extractions: stillFailing }), "M6_gemini_failure_rate").breached).toBe(true);
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
    const simulated = [...Array(4).fill(0).map(() => extraction()), extraction({ status: "simulated_outage", minutesAgo: 1 })];
    await syncAlerts(repo, evaluateRules({ ...base, extractions: simulated }), { webhookUrl: "https://hook.example", fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();

    const real = [...Array(4).fill(0).map(() => extraction()), extraction({ status: "api_error" })];
    await syncAlerts(repo, evaluateRules({ ...base, extractions: real }), { webhookUrl: "https://hook.example", fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("replaces an open simulated alert once real failures keep the rule breached, and posts it", async () => {
    const repo = new MemoryRepo();
    const fetchFn = vi.fn(async () => new Response("ok"));
    const opts = { webhookUrl: "https://hook.example", fetchFn };
    const healthy = Array.from({ length: 4 }, () => extraction({ minutesAgo: 30 }));
    const simulated = [extraction({ status: "simulated_outage", minutesAgo: 20 }), ...healthy];
    await syncAlerts(repo, evaluateRules({ ...base, extractions: simulated }), opts);
    expect((await repo.listOpenAlerts()).map((a) => [a.rule, a.simulated, a.value])).toEqual([["M6_gemini_failure_rate", true, 0.2]]);

    const realFailures = Array.from({ length: 5 }, (_, i) => extraction({ status: "api_error", minutesAgo: 1 + i }));
    const ev = rule(evaluateRules({ ...base, extractions: [...realFailures, ...simulated] }), "M6_gemini_failure_rate");
    expect(ev).toMatchObject({ breached: true, simulated: false, value: 0.6 });
    const open = await syncAlerts(repo, evaluateRules({ ...base, extractions: [...realFailures, ...simulated] }), opts);
    expect(open.map((a) => [a.rule, a.simulated, a.value])).toEqual([["M6_gemini_failure_rate", false, 0.6]]);
    expect(repo.alerts.find((a) => a.simulated)?.resolvedAt).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Still breached and still real: the alert stays open and is not posted again.
    await syncAlerts(repo, evaluateRules({ ...base, extractions: [...realFailures, ...simulated] }), opts);
    expect(await repo.listOpenAlerts()).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("replaces an open alert whose severity changed", async () => {
    const repo = new MemoryRepo();
    const fetchFn = vi.fn(async () => new Response("ok"));
    const [m3] = evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] }).filter((e) => e.breached);
    await syncAlerts(repo, [{ ...m3, severity: "warning" }], { webhookUrl: "https://hook.example", fetchFn });
    const open = await syncAlerts(repo, [m3], { webhookUrl: "https://hook.example", fetchFn });
    expect(open.map((a) => a.severity)).toEqual(["critical"]);
    expect(repo.alerts).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("keeps the alert that matches the rule when duplicates come back in either order", async () => {
    for (const order of ["oldest", "newest"] as const) {
      const repo = new MemoryRepo();
      const fetchFn = vi.fn(async () => new Response("ok"));
      const [m3] = evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] }).filter((e) => e.breached);
      await repo.insertAlert({ ...m3, simulated: true, resolvedAt: null });
      await repo.insertAlert({ ...m3, resolvedAt: null });
      const list = repo.listOpenAlerts.bind(repo);
      repo.listOpenAlerts = async () => (order === "newest" ? (await list()).reverse() : list());
      const open = await syncAlerts(repo, [m3], { webhookUrl: "https://hook.example", fetchFn });
      expect(open.map((a) => a.simulated)).toEqual([false]);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("two checks at the same moment open one alert and post one webhook", async () => {
    const repo = new MemoryRepo();
    const fetchFn = vi.fn(async () => new Response("ok"));
    const failing = evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] });
    const opts = { webhookUrl: "https://hook.example", fetchFn };
    await Promise.all([syncAlerts(repo, failing, opts), syncAlerts(repo, failing, opts)]);
    expect(await repo.listOpenAlerts()).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("resolves a duplicate open alert left by another server instance", async () => {
    const repo = new MemoryRepo();
    const failing = evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] });
    const [m3] = failing.filter((e) => e.breached);
    for (let i = 0; i < 2; i++) await repo.insertAlert({ ...m3, resolvedAt: null });
    expect(await syncAlerts(repo, failing)).toHaveLength(1);
  });

  it("gives up on a webhook that does not answer instead of holding the request", async () => {
    vi.useFakeTimers();
    try {
      const repo = new MemoryRepo();
      const fetchFn = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
      );
      const failing = evaluateRules({ ...base, runs: [run({ validatorRejections: 1 })] });
      const done = syncAlerts(repo, failing, { webhookUrl: "https://hook.example", fetchFn: fetchFn as typeof fetch });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await done).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

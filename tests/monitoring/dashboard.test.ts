// loadDashboard adds what the page needs to read on its own: runs per result, the orders whose
// latest run still needs attention, and the alert limits shown next to each number.
import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "@/lib/monitoring/alerts";
import { loadDashboard, reviewSeries } from "@/lib/monitoring/dashboard";
import { MemoryRepo } from "@/lib/db/memory";
import { extraction, NOW, run } from "./fixtures";

describe("loadDashboard", () => {
  it("counts outcomes, lists only orders whose latest run is a problem, and sends the limits", async () => {
    const repo = new MemoryRepo();
    repo.orderRuns.push(
      run({ orderId: "1001", status: "no_box", minutesAgo: 30 }),
      run({ orderId: "1001", status: "box_found", minutesAgo: 10 }), // fixed since: not a problem any more
      run({ orderId: "1006", status: "needs_measurement", minutesAgo: 20 }),
      run({ orderId: "1020", status: "no_box", minutesAgo: 5 }),
      run({ orderId: "1099", status: "error", minutesAgo: 1, trigger: "eval" }), // evaluation traffic is excluded
    );
    const d = await loadDashboard(repo, "24h", NOW);
    expect(d.outcomes).toEqual({ box_found: 1, no_box: 2, needs_measurement: 1, error: 0 });
    expect(d.problemOrders.map((p) => [p.orderId, p.status])).toEqual([
      ["1020", "no_box"],
      ["1006", "needs_measurement"],
    ]);
    expect(d.targets).toMatchObject({ failureRate: THRESHOLDS.m6FailureRate, cachedP95Ms: THRESHOLDS.m5CachedP95Ms });
    expect(d.recentRuns.map((r) => r.orderId)).toEqual(["1020", "1001", "1006", "1001"]);
  });

  it("scopes the numbers to the window but checks alerts over 7 days, from one read", async () => {
    const repo = new MemoryRepo();
    const twoDays = 2 * 24 * 60;
    for (let i = 0; i < 6; i++) repo.extractionEvents.push(extraction({ status: "api_error", minutesAgo: twoDays + i }));
    repo.extractionEvents.push(extraction({ minutesAgo: 30 }), extraction({ minutesAgo: 9 * 24 * 60 }));
    repo.orderRuns.push(run({ minutesAgo: 30 }), run({ minutesAgo: twoDays }));
    const d = await loadDashboard(repo, "1h", NOW);
    expect(d.totals).toMatchObject({ runs: 1, extractions: 1 });
    expect(d.alerts.map((a) => a.rule)).toContain("M6_gemini_failure_rate"); // the failures two days ago count
    const all = await loadDashboard(repo, "all", NOW);
    expect(all.totals).toMatchObject({ runs: 2, extractions: 8 });
  });

  it("charts the last 40 orders but counts every timed order in the window", async () => {
    const repo = new MemoryRepo();
    for (let i = 0; i < 45; i++) repo.orderRuns.push(run({ orderId: String(1001 + i), minutesAgo: 60 + i }));
    const d = await loadDashboard(repo, "24h", NOW);
    expect(d.latency).toHaveLength(40);
    expect(d.totals.timedOrders).toBe(45);
  });

  it("gives one point per reviewed order with the AI-read products it corrected", () => {
    const edited = run({ id: "r-edit", orderId: "1002", employeeAction: "edited", aiProducts: ["p-16", "p-17", "p-19"], minutesAgo: 20 });
    const confirmed = run({ id: "r-ok", orderId: "1003", employeeAction: "confirmed", aiProducts: ["p-07"], minutesAgo: 10 });
    const pending = run({ orderId: "1004", employeeAction: "pending", aiProducts: ["p-03"], minutesAgo: 5 }); // not reviewed yet
    const manualOnly = run({ orderId: "1006", employeeAction: "confirmed", aiProducts: [], minutesAgo: 4 }); // nothing Rassah read
    const fix = (productId: string, field: string, priorOrigin: "ai" | "none" = "ai") => ({ runId: "r-edit", productId, field, oldValue: "1", newValue: "2", priorOrigin });
    const points = reviewSeries(
      [confirmed, pending, edited, manualOnly],
      [fix("p-16", "height_cm"), fix("p-16", "weight_g"), fix("p-17", "fragile"), fix("p-28", "height_cm", "none")],
    );
    expect(points.map((p) => [p.orderId, p.reviewed, p.corrected, p.fields])).toEqual([
      ["1002", 3, 2, ["height_cm", "weight_g", "fragile"]],
      ["1003", 1, 0, []],
    ]);
  });
});

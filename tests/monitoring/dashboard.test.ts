// loadDashboard adds what the page needs to read on its own: runs per result, the orders whose
// latest run still needs attention, and the alert limits shown next to each number.
import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "@/lib/monitoring/alerts";
import { loadDashboard, reviewSeries } from "@/lib/monitoring/dashboard";
import { MemoryRepo } from "@/lib/db/memory";
import { NOW, run } from "./fixtures";

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

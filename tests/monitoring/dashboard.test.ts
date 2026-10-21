// loadDashboard adds what the page needs to read on its own: runs per result, the orders whose
// latest run still needs attention, and the alert limits shown next to each number.
import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "@/lib/monitoring/alerts";
import { loadDashboard } from "@/lib/monitoring/dashboard";
import { MemoryRepo } from "../fakes/memory-repo";
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
});

// The in-memory repo returns rows in the same order as the Supabase one, so code that relies on
// that order (alert de-duplication, the order view) behaves the same in tests, offline and in production.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/db/memory";
import { SupabaseRepo } from "@/lib/db/supabase";
import type { Alert } from "@/lib/db/types";
import { syncAlerts, type RuleEvaluation } from "@/lib/monitoring/alerts";

const alert = (rule: string, message: string): Alert => ({
  rule,
  severity: "warning",
  value: 1,
  threshold: 0,
  sampleSize: 1,
  message,
  simulated: false,
  resolvedAt: null,
});

/** Records the .order() calls of one supabase-js query and answers with `rows`. */
function recordingDb(rows: unknown[]) {
  const orders: Array<[string, { ascending?: boolean } | undefined]> = [];
  const b = {
    select: () => b,
    is: () => b,
    eq: () => b,
    order: (col: string, opts?: { ascending?: boolean }) => (orders.push([col, opts]), b),
    limit: () => b,
    then: (resolve: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return { db: { from: () => b } as unknown as SupabaseClient, orders };
}

describe("listOpenAlerts", () => {
  it("is newest first in both repos", async () => {
    const { db, orders } = recordingDb([]);
    await new SupabaseRepo(db).listOpenAlerts();
    expect(orders).toEqual([["created_at", { ascending: false }]]);

    const repo = new MemoryRepo();
    await repo.insertAlert(alert("M3_validator_rejection", "older"));
    await repo.insertAlert(alert("M6_gemini_failure_rate", "middle"));
    await repo.insertAlert(alert("M3_validator_rejection", "newer"));
    expect((await repo.listOpenAlerts()).map((a) => a.message)).toEqual(["newer", "middle", "older"]);
  });

  it("keeps the newest of two duplicate open alerts and resolves the older one", async () => {
    const repo = new MemoryRepo();
    await repo.insertAlert(alert("M3_validator_rejection", "older"));
    await repo.insertAlert(alert("M3_validator_rejection", "newer"));
    const breached: RuleEvaluation = {
      rule: "M3_validator_rejection",
      severity: "warning",
      breached: true,
      value: 1,
      threshold: 0,
      sampleSize: 1,
      message: "again",
      simulated: false,
    };
    const open = await syncAlerts(repo, [breached]);
    expect(open.map((a) => a.message)).toEqual(["newer"]);
    expect(repo.alerts.find((a) => a.message === "older")!.resolvedAt).not.toBeNull();
  });
});

describe("getOrder", () => {
  it("returns lines sorted by product id in both repos", async () => {
    const items = [
      { product_id: "p-12", qty: 1 },
      { product_id: "p-03", qty: 2 },
      { product_id: "p-07", qty: 1 },
    ];
    const { db } = recordingDb([{ id: "1001", demo: null, expect: null, order_items: items }]);
    const fromSupabase = await new SupabaseRepo(db).getOrder("1001");

    const repo = new MemoryRepo();
    repo.orders.set("1001", { id: "1001", demo: null, expect: null, lines: items.map((i) => ({ productId: i.product_id, qty: i.qty })) });
    const fromMemory = await repo.getOrder("1001");

    expect(fromMemory).toEqual(fromSupabase);
    expect(fromMemory!.lines.map((l) => l.productId)).toEqual(["p-03", "p-07", "p-12"]);
    // The stored order itself is not reordered.
    expect(repo.orders.get("1001")!.lines[0].productId).toBe("p-12");
  });
});

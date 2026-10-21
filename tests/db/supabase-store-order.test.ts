// SupabaseRepo.createStoreOrder against a fake supabase-js client: numbering from the newest store
// order, retry when the number is taken meanwhile (23505), and no half-written order when items fail.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseRepo } from "@/lib/db/supabase";

type Q = { table: string; op: "select" | "insert" | "delete"; payload?: unknown; filters: Array<[string, unknown]>; limit?: number; range?: [number, number] };
type Res = { data: unknown; error: { message: string; code?: string } | null };

function fakeDb(handle: (q: Q) => Res) {
  const calls: Q[] = [];
  const from = (table: string) => {
    const q: Q = { table, op: "select", filters: [] };
    const b = {
      select: () => b,
      insert: (payload: unknown) => ((q.op = "insert"), (q.payload = payload), b),
      delete: () => ((q.op = "delete"), b),
      eq: (col: string, val: unknown) => (q.filters.push([col, val]), b),
      order: () => b,
      limit: (n: number) => ((q.limit = n), b),
      range: (a: number, z: number) => ((q.range = [a, z]), b),
      then: (resolve: (r: Res) => unknown) => (calls.push(q), Promise.resolve(handle(q)).then(resolve)),
    };
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, calls };
}

const ok = (data: unknown = null): Res => ({ data, error: null });
const lines = [{ productId: "p-01", qty: 2 }];

describe("SupabaseRepo.createStoreOrder", () => {
  it("starts at 5001 and reads only the newest store order (one row)", async () => {
    const { db, calls } = fakeDb((q) => (q.op === "select" ? ok([]) : ok()));
    expect(await new SupabaseRepo(db).createStoreOrder("سارة", lines)).toEqual({ id: "5001" });
    const read = calls[0];
    expect(read).toMatchObject({ table: "orders", op: "select", limit: 1, filters: [["demo", "store"]] });
    expect(calls[1]).toMatchObject({ table: "orders", op: "insert", payload: { id: "5001", demo: "store", expect: "سارة" } });
    expect(calls[2]).toMatchObject({ table: "order_items", op: "insert", payload: [{ order_id: "5001", product_id: "p-01", qty: 2 }] });
  });

  it("retries with the next number when the chosen one was taken meanwhile", async () => {
    let inserts = 0;
    const { db } = fakeDb((q) => {
      if (q.op === "select") return ok([{ id: "5007" }]);
      if (q.table === "orders" && q.op === "insert" && inserts++ === 0) return { data: null, error: { message: "duplicate key", code: "23505" } };
      return ok();
    });
    expect(await new SupabaseRepo(db).createStoreOrder("سارة", lines)).toEqual({ id: "5009" }); // 5008 taken → 5009
  });

  it("deletes the order when its items cannot be saved, and reports the error", async () => {
    const { db, calls } = fakeDb((q) => {
      if (q.op === "select") return ok([]);
      if (q.table === "order_items") return { data: null, error: { message: "fk violation" } };
      return ok();
    });
    await expect(new SupabaseRepo(db).createStoreOrder("سارة", lines)).rejects.toThrow(/fk violation/);
    expect(calls.at(-1)).toMatchObject({ table: "orders", op: "delete", filters: [["id", "5001"]] });
  });

  it("gives up after 5 taken numbers instead of looping", async () => {
    const { db } = fakeDb((q) => (q.op === "select" ? ok([]) : { data: null, error: { message: "duplicate key", code: "23505" } }));
    await expect(new SupabaseRepo(db).createStoreOrder("سارة", lines)).rejects.toThrow(/no free order number/);
  });
});

describe("SupabaseRepo.listOrders", () => {
  it("pages past the 1,000-row API limit so new store orders still reach the dashboard", async () => {
    const all = Array.from({ length: 2345 }, (_, i) => ({ id: String(5001 + i), demo: "store", expect: "سارة", created_at: null, order_items: [] }));
    const { db, calls } = fakeDb((q) => ok(all.slice(q.range![0], q.range![1] + 1)));
    const orders = await new SupabaseRepo(db).listOrders();
    expect(orders).toHaveLength(2345);
    expect(orders.at(-1)).toMatchObject({ id: "7345", customerName: "سارة" });
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

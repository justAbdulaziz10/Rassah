// Built-in store checkout: the order lands in Rassah's orders table (numbered from 5001) with the
// customer's name, appears in the packer's queue, and the customer name is required.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/db/memory";

vi.mock("next/server", () => ({ connection: async () => {} }));

let repo: MemoryRepo;
vi.mock("@/lib/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http")>();
  return { ...actual, repoOrError: () => repo, log: () => {} };
});

const { POST } = await import("@/app/api/store/checkout/route");
const { storeLimiter } = await import("@/lib/rate-limit");
const { buildQueue } = await import("@/lib/orders/queue");

function call(body: unknown, ip = "203.0.113.9") {
  return POST(
    new Request("http://localhost/api/store/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  repo = new MemoryRepo();
  for (const id of ["p-01", "p-02"]) repo.products.set(id, { id, name: id, description: "", url: null, category: null, sourceHash: id });
  repo.orders.set("1001", { id: "1001", demo: "quick-success", expect: "seed", lines: [{ productId: "p-01", qty: 1 }] });
  storeLimiter.reset();
});

describe("POST /api/store/checkout", () => {
  it("creates order 5001 with the customer's name, merged lines, and it shows in the queue as new", async () => {
    const res = await call({ customerName: "  سارة  ", items: [{ productId: "p-02", qty: 1 }, { productId: "p-01", qty: 2 }, { productId: "p-02", qty: 1 }] });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ orderId: "5001" });

    const order = await repo.getOrder("5001");
    expect(order).toEqual({ id: "5001", demo: "store", customerName: "سارة", lines: [{ productId: "p-01", qty: 2 }, { productId: "p-02", qty: 2 }] });
    expect((await repo.getOrder("1001"))?.customerName).toBeNull(); // seeded orders are not store orders

    const queue = buildQueue(await repo.listOrders(), [], new Map());
    expect(queue.find((e) => e.order.id === "5001")).toMatchObject({ state: "new", order: { customerName: "سارة", unitCount: 4 } });

    expect(await (await call({ customerName: "علي", items: [{ productId: "p-01", qty: 1 }] })).json()).toEqual({ orderId: "5002" });
  });

  it("requires the customer's name", async () => {
    for (const customerName of [undefined, "", "   ", "ع"]) {
      const res = await call({ customerName, items: [{ productId: "p-01", qty: 1 }] });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("اسم العميل");
    }
    expect(repo.orders.size).toBe(1);
  });

  it("does not count invisible characters toward the name", async () => {
    const res = await call({ customerName: "\u200b\u202eع\u200b", items: [{ productId: "p-01", qty: 1 }] });
    expect(res.status).toBe(400);
    await call({ customerName: "سا\u202eرة", items: [{ productId: "p-01", qty: 1 }] });
    expect((await repo.getOrder("5001"))?.customerName).toBe("سارة");
  });

  it("rejects unknown products, products the store does not sell, an empty cart, and carts over the caps", async () => {
    repo.products.set("p-x9", { id: "p-x9", name: "p-x9", description: "", url: null, category: null, sourceHash: "p-x9" }); // no store price
    const bad = [
      { customerName: "سارة", items: [{ productId: "p-x9", qty: 1 }] },
      { customerName: "سارة", items: [{ productId: "p-99", qty: 1 }] },
      { customerName: "سارة", items: [] },
      { customerName: "سارة", items: [{ productId: "p-01", qty: 2 }, { productId: "p-01", qty: 2 }] }, // 4 of one product after merging
      { customerName: "سارة", items: [{ productId: "p-01", qty: 4 }] },
    ];
    for (const body of bad) expect((await call(body)).status).toBe(400);
    expect(repo.orders.size).toBe(1);
  });

  it("rate-limits checkouts per IP", async () => {
    const body = { customerName: "سارة", items: [{ productId: "p-01", qty: 1 }] };
    for (let i = 0; i < 10; i++) expect((await call(body)).status).toBe(201);
    expect((await call(body)).status).toBe(429);
  });
});

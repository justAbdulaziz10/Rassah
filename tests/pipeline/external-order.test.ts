import { describe, expect, it, vi } from "vitest";
import type { ExtractDeps, GenerateFn } from "@/lib/ai/extractor";
import { makeStoreOrderFetcher, storeIntegrationConfig } from "@/lib/integrations/store";
import { runPack, type ExternalOrder } from "@/lib/pipeline/pack";
import { MemoryRepo } from "@/lib/db/memory";
import { RESPONSES } from "../fixtures/gemini/responses";

function setup() {
  const repo = new MemoryRepo();
  repo.cartons = [{ id: "L", name: "L", inner: [40, 30, 25], maxWeightG: 15000, tareG: 450, costSar: 2.6 }];
  for (const id of ["p-01", "p-02"]) {
    repo.products.set(id, { id, name: `منتج ${id}`, description: `وصف ${id}`, url: null, category: null, sourceHash: `h-${id}` });
  }
  const generate = vi.fn<GenerateFn>(async () => ({
    text: JSON.stringify(RESPONSES.explicitPerfume),
    inputTokens: 500,
    outputTokens: 100,
    thinkingTokens: 0,
    blocked: false,
  }));
  const deps: ExtractDeps = { generate, model: "m", promptVersion: "v1", priceInputPerM: 0, priceOutputPerM: 0, sleep: async () => {} };
  return { repo, deps };
}

const base = (repo: MemoryRepo, deps: ExtractDeps, externalOrders?: (id: string) => Promise<ExternalOrder | null>) => ({
  repo,
  deps,
  orderId: "5001",
  runId: "run-ext",
  engineVersion: "engine-test",
  promptVersion: "v1",
  externalOrders,
});

describe("runPack with an external order source (demo store / Salla later)", () => {
  it("packs an order that exists only in the store, without writing it to Rassah's tables", async () => {
    const { repo, deps } = setup();
    const ordersBefore = repo.orders.size;
    const productsBefore = repo.products.size;
    const fetcher = vi.fn(async () => ({ id: "5001", source: "store", lines: [{ productId: "p-01", qty: 1 }, { productId: "p-02", qty: 2 }] }));

    const r = await runPack(base(repo, deps, fetcher));

    expect(fetcher).toHaveBeenCalledWith("5001");
    expect(r.status).toBe("box_found");
    expect(r.orderSource).toBe("store");
    expect(r.lines.map((l) => [l.productId, l.qty])).toEqual([["p-01", 1], ["p-02", 2]]);
    // Read-only: the store order is NOT copied into Rassah's orders or products.
    expect(repo.orders.size).toBe(ordersBefore);
    expect(repo.products.size).toBe(productsBefore);
    expect(repo.orderRuns[0]).toMatchObject({ orderId: "5001", status: "box_found" });
  });

  it("prefers Rassah's own order and never calls the store for it", async () => {
    const { repo, deps } = setup();
    repo.orders.set("5001", { id: "5001", demo: null, expect: null, lines: [{ productId: "p-01", qty: 1 }] });
    const fetcher = vi.fn(async () => null);
    const r = await runPack(base(repo, deps, fetcher));
    expect(fetcher).not.toHaveBeenCalled();
    expect(r.orderSource).toBe("rassah");
  });

  it("not found anywhere → not_found", async () => {
    const { repo, deps } = setup();
    const r = await runPack(base(repo, deps, async () => null));
    expect(r.status).toBe("not_found");
  });

  it("store down → error with a clear reason, logged as store_unreachable", async () => {
    const { repo, deps } = setup();
    const r = await runPack(base(repo, deps, async () => { throw new Error("connect ECONNREFUSED"); }));
    expect(r.status).toBe("error");
    expect(r.errorMessage).toMatch(/orders API/);
    expect(repo.orderRuns[0].errorCode).toBe("store_unreachable");
  });

  it("product the store sells but Rassah's catalog doesn't know → error, no guessing", async () => {
    const { repo, deps } = setup();
    const r = await runPack(base(repo, deps, async () => ({ id: "5001", source: "store", lines: [{ productId: "p-99", qty: 1 }] })));
    expect(r.status).toBe("error");
    expect(r.errorMessage).toMatch(/p-99/);
    expect(repo.orderRuns[0].errorCode).toBe("product_not_in_catalog");
  });
});

describe("store API client", () => {
  const cfg = { url: "https://store.example", key: "secret" };
  const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("is off unless both URL and key are set", () => {
    expect(storeIntegrationConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(storeIntegrationConfig({ STORE_API_URL: "https://x/" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(storeIntegrationConfig({ STORE_API_URL: "https://x/", STORE_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toEqual({ url: "https://x", key: "k" });
  });

  it("sends the bearer key and merges duplicate lines", async () => {
    const f = respond(200, { id: "5001", items: [{ productId: "p-02", qty: 1 }, { productId: "p-01", qty: 1 }, { productId: "p-02", qty: 2 }] });
    const order = await makeStoreOrderFetcher(cfg, f)("5001");
    expect(order).toEqual({ id: "5001", source: "store", lines: [{ productId: "p-01", qty: 1 }, { productId: "p-02", qty: 3 }] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://store.example/api/orders/5001");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
  });

  it("404 → null; other errors and bad shapes → throw", async () => {
    expect(await makeStoreOrderFetcher(cfg, respond(404, { error: "nope" }))("1")).toBeNull();
    await expect(makeStoreOrderFetcher(cfg, respond(500, {}))("1")).rejects.toThrow(/HTTP 500/);
    await expect(makeStoreOrderFetcher(cfg, respond(200, { id: "1", items: [] }))("1")).rejects.toThrow(/unexpected/);
  });
});

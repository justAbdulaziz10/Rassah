import "server-only";
import { z } from "zod";
import type { ExternalOrder } from "@/lib/pipeline/pack";

// Read-only client for a connected store's orders API (today: the demo store in store/; later: Salla).
// Rassah never copies the order into its own tables: it reads it when the packer types the number.
// Off unless both STORE_API_URL and STORE_API_KEY are set, so production is unchanged by default.

const StoreOrderSchema = z.object({
  id: z.string().regex(/^\d{1,10}$/),
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(12) }))
    .min(1),
});

export function storeIntegrationConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.STORE_API_URL?.trim().replace(/\/+$/, "");
  const key = env.STORE_API_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function makeStoreOrderFetcher(
  cfg: { url: string; key: string },
  fetchFn: typeof fetch = fetch,
  timeoutMs = 5000,
): (orderId: string) => Promise<ExternalOrder | null> {
  return async (orderId) => {
    const res = await fetchFn(`${cfg.url}/api/orders/${encodeURIComponent(orderId)}`, {
      headers: { authorization: `Bearer ${cfg.key}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`store API answered HTTP ${res.status}`);
    const parsed = StoreOrderSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("store API returned an unexpected order shape");
    // Merge duplicate lines so the engine sees one line per product.
    const byProduct = new Map<string, number>();
    for (const it of parsed.data.items) byProduct.set(it.productId, (byProduct.get(it.productId) ?? 0) + it.qty);
    return {
      id: parsed.data.id,
      source: "store",
      lines: [...byProduct].map(([productId, qty]) => ({ productId, qty })).sort((a, b) => a.productId.localeCompare(b.productId)),
    };
  };
}

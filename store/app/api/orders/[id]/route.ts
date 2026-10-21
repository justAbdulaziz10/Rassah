import { timingSafeEqual } from "node:crypto";
import { PRODUCT_BY_ID } from "@/lib/catalog";
import { getOrder, StorageNotConfigured } from "@/lib/orders";

export const dynamic = "force-dynamic";

// The store's Orders API: what Rassah (or any connected app) calls to read an order,
// the same way an integration would call Salla's API. Requires the shared API key.
function authorized(request: Request): boolean {
  const expected = process.env.STORE_API_KEY?.trim();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d{1,10}$/.test(id)) return Response.json({ error: "invalid order id" }, { status: 400 });
  try {
    const order = await getOrder(id);
    if (!order) return Response.json({ error: "order not found" }, { status: 404 });
    return Response.json({
      id: order.id,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({ productId: i.productId, name: PRODUCT_BY_ID.get(i.productId)?.name ?? null, qty: i.qty })),
    });
  } catch (e) {
    if (e instanceof StorageNotConfigured) return Response.json({ error: e.message }, { status: 503 });
    return Response.json({ error: "store error" }, { status: 500 });
  }
}

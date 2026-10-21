import { z } from "zod";
import { MAX_QTY_PER_LINE, MAX_UNITS, PRODUCT_BY_ID } from "@/lib/catalog";
import { createOrder, StorageNotConfigured } from "@/lib/orders";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    customerName: z.string().trim().max(60).optional(),
    items: z
      .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(MAX_QTY_PER_LINE) }))
      .min(1)
      .max(12),
  })
  .strict();

// Best-effort per-instance limit so a public demo URL can't be flooded with orders.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return Response.json({ error: "طلبات كثيرة، جرّب بعد دقيقة" }, { status: 429 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "السلة غير صالحة" }, { status: 400 });

  const merged = new Map<string, number>();
  for (const it of parsed.data.items) {
    if (!PRODUCT_BY_ID.has(it.productId)) return Response.json({ error: `منتج غير معروف: ${it.productId}` }, { status: 400 });
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.qty);
  }
  const items = [...merged].map(([productId, qty]) => ({ productId, qty }));
  if (items.some((i) => i.qty > MAX_QTY_PER_LINE)) return Response.json({ error: `الحد ${MAX_QTY_PER_LINE} لكل منتج` }, { status: 400 });
  if (items.reduce((s, i) => s + i.qty, 0) > MAX_UNITS) return Response.json({ error: `الحد ${MAX_UNITS} قطعة للطلب` }, { status: 400 });

  try {
    const order = await createOrder(items, parsed.data.customerName || null);
    return Response.json({ orderId: order.id }, { status: 201 });
  } catch (e) {
    if (e instanceof StorageNotConfigured) return Response.json({ error: e.message }, { status: 503 });
    return Response.json({ error: "تعذر إنشاء الطلب" }, { status: 500 });
  }
}

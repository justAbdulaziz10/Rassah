import { connection } from "next/server";
import { jsonError, log, readJson, repoOrError } from "@/lib/http";
import { rateLimitOrNull, storeLimiter } from "@/lib/rate-limit";
import { CheckoutSchema, normalizeCart, PRICE_SAR } from "@/lib/store/catalog";

// Checkout for the built-in store: writes the order to Rassah's own orders table, where it
// appears in the packer's queue. Nothing is paid or shipped.
export async function POST(request: Request) {
  await connection();
  const limited = rateLimitOrNull(storeLimiter, request);
  if (limited) return limited;

  const body = CheckoutSchema.safeParse(await readJson(request));
  if (!body.success) {
    const nameIssue = body.error.issues.find((i) => i.path[0] === "customerName");
    return jsonError(400, nameIssue ? "اكتب اسم العميل (حرفان على الأقل)" : "السلة غير صالحة");
  }

  const repo = repoOrError();
  if (repo instanceof Response) return repo;

  const ids = [...new Set(body.data.items.map((i) => i.productId))];
  const known = new Set((await repo.getProducts(ids)).map((p) => p.id).filter((id) => PRICE_SAR[id] !== undefined)); // sold in the store
  const cart = normalizeCart(body.data.items, known);
  if (!cart.ok) return jsonError(400, cart.error);

  try {
    const { id } = await repo.createStoreOrder(body.data.customerName, cart.lines);
    log({ stage: "store_checkout", orderId: id, lines: cart.lines.length });
    return Response.json({ orderId: id }, { status: 201 });
  } catch (e) {
    log({ stage: "store_checkout", error: (e as Error).message?.slice(0, 200) });
    return jsonError(500, "تعذّر إنشاء الطلب، جرّب مرة أخرى");
  }
}

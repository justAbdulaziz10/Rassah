import { z } from "zod";
import prices from "@/data/store-prices.json";

// The built-in store (/store): customers fill a cart, the order lands in Rassah's orders table
// and shows up in the packer's queue. Products are Rassah's own catalog; only prices live here.

export const PRICE_SAR: Record<string, number> = prices.prices;

/** Rassah packs at most 12 units per order (order_items.qty check), so checkout enforces the same caps. */
export const MAX_UNITS = 12;
export const MAX_QTY_PER_LINE = 3;

export const CATEGORY_LABEL: Record<string, string> = {
  perfume: "عطور",
  books: "كتب",
  incense: "بخور ومباخر",
  electronics: "إلكترونيات",
  candles: "شموع",
  "phone-accessories": "إكسسوارات جوال",
  honey: "عسل",
  kitchen: "مطبخ",
  food: "أغذية",
  stationery: "قرطاسية",
  dates: "تمور",
  skincare: "عناية",
  appliances: "أجهزة",
  coffee: "قهوة",
  gifts: "هدايا",
  general: "منوعات",
};

export const CheckoutSchema = z
  .object({
    // Control and invisible format characters (bidi overrides, zero-width) are dropped before the length check.
    customerName: z
      .string()
      .transform((s) => s.replace(/[\p{Cc}\p{Cf}]/gu, "").trim())
      .pipe(z.string().min(2, "اكتب اسم العميل").max(60)),
    items: z
      .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(MAX_QTY_PER_LINE) }))
      .min(1)
      .max(MAX_UNITS),
  })
  .strict();

export type CheckoutResult = { ok: true; lines: Array<{ productId: string; qty: number }> } | { ok: false; error: string };

/** Merges duplicate lines and applies the caps. `known` = product ids that exist in the catalog. */
export function normalizeCart(items: Array<{ productId: string; qty: number }>, known: Set<string>): CheckoutResult {
  const merged = new Map<string, number>();
  for (const it of items) {
    if (!known.has(it.productId)) return { ok: false, error: "في السلة منتج غير موجود في المتجر" };
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.qty);
  }
  const lines = [...merged].map(([productId, qty]) => ({ productId, qty })).sort((a, b) => a.productId.localeCompare(b.productId));
  if (lines.some((l) => l.qty > MAX_QTY_PER_LINE)) return { ok: false, error: `الحد ${MAX_QTY_PER_LINE} قطع لكل منتج` };
  if (lines.reduce((s, l) => s + l.qty, 0) > MAX_UNITS) return { ok: false, error: `الحد ${MAX_UNITS} قطعة للطلب` };
  return { ok: true, lines };
}

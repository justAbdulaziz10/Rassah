// Plain-Arabic names for where an order stands. One place, so every screen says the same thing.

import type { AttentionReason, QueueState } from "./queue";

export const STATE_LABEL: Record<QueueState, string> = {
  new: "جديد",
  ready: "بانتظار تأكيدك",
  attention: "يحتاج تدخّلك",
  done: "تم التغليف",
};

/** Pill colours per state (token classes from app/globals.css). */
export const STATE_STYLE: Record<QueueState, string> = {
  new: "bg-brand/15 text-brand",
  ready: "bg-info-soft text-info",
  attention: "bg-critical text-white",
  done: "bg-ok-soft text-ok",
};

export const REASON_LABEL: Record<AttentionReason, string> = {
  needs_measurement: "أحد منتجاته يحتاج قياساً قبل التغليف",
  no_box: "لا يوجد كرتون مناسب لهذا الطلب",
  split: "لا يتّسع في كرتون واحد، افتحه لترى تقسيمه على أكثر من كرتون",
  error: "تعذّر تجهيز الطلب، افتحه وأعد المحاولة",
};

/** Filter tabs on the orders page, in display order. "remaining" is everything not packed yet. */
export const FILTERS = [
  { key: "remaining", label: "المتبقية" },
  { key: "attention", label: "تحتاج تدخّلك" },
  { key: "new", label: "جديدة" },
  { key: "ready", label: "بانتظار تأكيدك" },
  { key: "done", label: "تم تغليفها" },
  { key: "all", label: "الكل" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];

export function parseFilter(v: string | string[] | undefined): FilterKey {
  const s = Array.isArray(v) ? v[0] : v;
  return FILTERS.some((f) => f.key === s) ? (s as FilterKey) : "remaining";
}

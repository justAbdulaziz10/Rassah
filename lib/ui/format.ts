// Display helpers shared by UI components. Western digits with units for readability.

import type { DataSource } from "@/lib/engine/types";

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export function fmtDims(d: ReadonlyArray<number | null> | null | undefined): string {
  if (!d || d.some((x) => x === null)) return "—";
  return `${d.map((x) => fmtNum(x)).join(" × ")} سم`;
}

export function fmtWeight(g: number | null | undefined): string {
  if (g === null || g === undefined) return "—";
  return g >= 1000 ? `${fmtNum(g / 1000, 2)} كجم` : `${fmtNum(g, 0)} جم`;
}

export function fmtSar(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${n.toFixed(2)} ر.س`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} ث` : `${Math.round(ms)} ms`;
}

export function fmtPct(x: number | null | undefined): string {
  return x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;
}

export function fmtUsd(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return x < 0.01 ? `$${x.toFixed(5)}` : `$${x.toFixed(3)}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "medium" });
}

export const SOURCE_LABEL: Record<DataSource, string> = {
  page: "من الصفحة",
  inferred: "تقديري",
  manual: "قياس يدوي",
  unknown: "غير معروف",
};

/** Who produced the stored facts. "seeded" = offline-demo data from the test set, never the AI. */
export const ORIGIN_LABEL: Record<string, string> = {
  ai: "AI",
  manual: "يدوي",
  ai_corrected: "AI مصحح",
  seeded: "بيانات تجريبية (بدون AI)",
};

export const STATUS_LABEL: Record<string, string> = {
  box_found: "تم اختيار كرتون",
  no_box: "لا يوجد كرتون مناسب",
  needs_measurement: "يحتاج قياس",
  error: "خطأ",
  not_found: "الطلب غير موجود",
};

export const OUTCOME_LABEL: Record<string, string> = {
  packed: "مناسب",
  oversize: "قطعة أكبر من الكرتون",
  overweight: "الوزن أكبر من حد الكرتون",
  search_budget: "انتهى وقت البحث",
  no_layout: "لم نجد ترتيباً صالحاً",
  validator_rejected: "رفضه الـ Validator",
};

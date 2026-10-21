// Display helpers shared by UI components. Western digits with units for readability.

import type { DataSource } from "@/lib/engine/types";

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

// Unicode directional isolates: keep a run of numbers left-to-right inside Arabic text,
// whatever element it lands in (cell, title attribute, chart label, plain string).
const LRI = "\u2066";
const PDI = "\u2069";

/** Wraps text in an LTR isolate so digits and "×" never reorder inside RTL text. */
export function ltr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

/** Dimensions as length × width × height, numbers isolated LTR and the unit outside: "‪40 × 30 × 25‬ سم". */
export function fmtDims(d: ReadonlyArray<number | null> | null | undefined): string {
  if (!d || d.some((x) => x === null)) return "—";
  return `${ltr(d.map((x) => fmtNum(x)).join(" × "))} سم`;
}

/**
 * Arabic count agreement: 1 and 2 use the singular and dual forms,
 * 3-10 the plural, 11+ the singular accusative (11 قطعة), 0 the plural form ("0 قطع").
 */
export function fmtCount(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms.one;
  if (abs === 2) return forms.two;
  if (abs >= 3 && abs <= 10) return `${ltr(String(n))} ${forms.few}`;
  if (abs >= 11) return `${ltr(String(n))} ${forms.many}`;
  return `${ltr(String(n))} ${forms.few}`;
}

/** 1 قطعة، 2 قطعتان، 3-10 قطع، 11+ قطعة. */
export function fmtPieces(n: number): string {
  return fmtCount(n, { one: "قطعة واحدة", two: "قطعتان", few: "قطع", many: "قطعة" });
}

export function fmtWeight(g: number | null | undefined): string {
  if (g === null || g === undefined) return "—";
  return g >= 1000 ? `${ltr(fmtNum(g / 1000, 2))} كجم` : `${ltr(fmtNum(g, 0))} جم`;
}

export function fmtSar(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${ltr(n.toFixed(2))} ر.س`;
}

/** Duration for people: seconds from one second up, milliseconds below ("850 ملّي ثانية"). */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "أقل من ملّي ثانية";
  return ms >= 1000 ? `${ltr((ms / 1000).toFixed(1))} ثانية` : `${ltr(String(Math.round(ms)))} ملّي ثانية`;
}

/** Short form for chart axes. Seconds when the chart reaches a second ("0.8 ث"), otherwise milliseconds ("12 مل.ث"). */
export function fmtAxisMs(ms: number | null | undefined, maxMs: number): string {
  if (ms === null || ms === undefined) return "—";
  if (maxMs >= 1000) return `${(ms / 1000).toFixed(1)} ث`;
  return `${maxMs < 10 ? ms.toFixed(1) : Math.round(ms)} مل.ث`;
}

export function fmtPct(x: number | null | undefined): string {
  return x === null || x === undefined ? "—" : ltr(`${Math.round(x * 100)}%`);
}

export function fmtUsd(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return ltr(x < 0.01 ? `$${x.toFixed(5)}` : `$${x.toFixed(3)}`);
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "short", timeStyle: "medium" });
}

export const SOURCE_LABEL: Record<DataSource, string> = {
  page: "من الصفحة",
  inferred: "تقدير",
  manual: "قياس يدوي",
  unknown: "غير معروف",
};

/** One-line meaning of each source, for tooltips. */
export const SOURCE_HINT: Record<DataSource, string> = {
  page: "المقاس مذكور صراحةً في صفحة المنتج",
  inferred: "لم يُذكر المقاس، فقدّرته رصّة من وصف المنتج. تأكد منه قبل إغلاق الكرتون",
  manual: "قاسه موظف بنفسه وأدخله",
  unknown: "لا يوجد مقاس معروف، ويلزم قياس المنتج",
};

/** Who produced the stored facts. "seeded" = offline-demo data from the test set, never the AI. */
export const ORIGIN_LABEL: Record<string, string> = {
  ai: "قرأتها رصّة (ذكاء اصطناعي)",
  manual: "أدخلها موظف",
  ai_corrected: "قرأتها رصّة وصحّحها موظف",
  seeded: "بيانات تجريبية جاهزة",
};

export const STATUS_LABEL: Record<string, string> = {
  box_found: "تم اختيار كرتون",
  no_box: "لا يوجد كرتون مناسب",
  needs_measurement: "يحتاج قياس",
  error: "حدث خطأ",
  not_found: "الطلب غير موجود",
};

export const OUTCOME_LABEL: Record<string, string> = {
  packed: "مناسب",
  oversize: "إحدى القطع أكبر من الكرتون",
  overweight: "الوزن أكبر من حدّ الكرتون",
  search_budget: "انتهى وقت البحث قبل إيجاد ترتيب",
  no_layout: "لم نجد ترتيباً صالحاً",
  validator_rejected: "رفضه المدقّق",
};

/** Result of one Gemini call, as shown on the monitoring page. */
export const EXTRACTION_STATUS_LABEL: Record<string, string> = {
  ok: "نجح",
  parse_error: "رد غير مفهوم",
  api_error: "خطأ في الخدمة",
  rate_limited: "تجاوز حدّ الطلبات",
  timeout: "انتهت المهلة",
  blocked: "رُفض الطلب من الخدمة",
  empty: "رد فارغ",
  config_error: "خطأ في إعداد الخدمة",
  simulated_outage: "عطل تجريبي",
};

const API_ERRORS: Array<[RegExp, string]> = [
  [/^Order( .*)? not found/i, "الطلب غير موجود. تأكد من رقم الطلب."],
  [/^Product( .*)? not found/i, "المنتج غير موجود."],
  [/^Run( .*)? not found/i, "عملية التجهيز غير موجودة."],
  [/order has no items/i, "الطلب لا يحتوي على أي منتجات."],
  [/order has \d+ units, maximum is (\d+)/i, "عدد القطع في الطلب أكبر من الحد المسموح به للتجهيز."],
  [/Length, width and height are all required/i, "أدخل الطول والعرض والارتفاع كلها."],
  [/Order number must be digits only/i, "رقم الطلب يجب أن يكون أرقاماً فقط."],
  [/Invalid (changes|action|request body|product id|run id)/i, "البيانات المرسلة غير صحيحة. راجع القيم وحاول مرة أخرى."],
  [/Could not save/i, "تعذّر الحفظ. حاول مرة أخرى."],
  [/Database is not configured|Database unavailable/i, "قاعدة البيانات غير متاحة حالياً."],
  [/Not available/i, "هذه الميزة غير متاحة."],
  [/Too many requests|rate limit/i, "عدد الطلبات كبير. انتظر قليلاً ثم حاول مرة أخرى."],
  [/^HTTP \d+/i, "تعذّر تنفيذ الطلب. حاول مرة أخرى."],
];

/** Turns an English API error into plain Arabic for screens employees see. Arabic messages pass through. */
export function fmtApiError(message: string | null | undefined): string {
  if (!message) return "حدث خطأ غير متوقع. حاول مرة أخرى.";
  if (/[؀-ۿ]/.test(message)) return message;
  for (const [re, ar] of API_ERRORS) if (re.test(message)) return ar;
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

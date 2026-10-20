// Arabic templates for packing instructions. Kept in one file so they are easy to review.

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const AR = {
  carton: (name: string, inner: readonly number[]) =>
    `استخدم كرتون «${name}» (${inner.map(fmt).join(" × ")} سم من الداخل).`,
  placeBottom: (name: string) => `ضع «${name}» في قاع الكرتون.`,
  placeOnTop: (name: string) => `ضع «${name}» فوق القطع اللي تحته.`,
  placeNext: (name: string) => `ضع «${name}» بجانب القطع السابقة.`,
  fragile: (paddingCm: number) =>
    `قابل للكسر: لفّه بغلاف فقاعي (${fmt(paddingCm)} سم على الأقل) ولا تضع فوقه أي شيء.`,
  liquid: "سائل: أبقِه واقفاً (هذا الجانب للأعلى).",
  sensitive: (paddingCm: number) => `حساس: أضف حشوة حماية ${fmt(paddingCm)} سم من كل الجهات.`,
  estimated: "⚠ مقاسه تقديري: تأكد إنه يدخل قبل إغلاق الكرتون.",
  voidFill: "املأ الفراغات بمواد حشو حتى لا تتحرك القطع، ثم أغلق الكرتون.",
  thisSideUp: "اكتب على الكرتون: «هذا الجانب للأعلى ↑».",
};

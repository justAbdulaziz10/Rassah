// Arabic templates for packing instructions. Kept in one file so they are easy to review.
// Language: simple Modern Standard Arabic that a warehouse employee reads at a glance.

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Directional isolate: the numbers and "×" stay left-to-right inside RTL text, the unit stays outside.
const ltr = (text: string) => `⁦${text}⁩`;

export const AR = {
  // `inner` is the carton's inner size in the catalog order: length × width × height.
  carton: (name: string, inner: readonly number[]) =>
    `استخدم كرتون «${name}»، أبعاده من الداخل ${ltr(inner.map(fmt).join(" × "))} سم (الطول × العرض × الارتفاع).`,
  placeBottom: (name: string) => `ضع «${name}» في قاع الكرتون.`,
  placeOnTop: (name: string) => `ضع «${name}» فوق القطع التي وُضعت قبله.`,
  placeNext: (name: string) => `ضع «${name}» بجانب القطع التي وُضعت قبله.`,
  fragile: (paddingCm: number) =>
    `قابل للكسر: لُفّه بغلاف فقاعي لا تقل سماكته عن ${ltr(fmt(paddingCm))} سم، ولا تضع فوقه أي شيء.`,
  liquid: "سائل: أبقِه واقفاً ولا تقلبه على جنبه، ويكون غطاؤه إلى الأعلى.",
  sensitive: (paddingCm: number) => `حسّاس: ضع حوله حشوة واقية سماكتها ${ltr(fmt(paddingCm))} سم من جميع الجهات.`,
  estimated: "⚠ مقاس هذه القطعة تقديري: تأكد أنها تدخل في الكرتون قبل إغلاقه.",
  voidFill: "املأ الفراغات بمادة حشو حتى لا تتحرك القطع، ثم أغلق الكرتون.",
  thisSideUp: "اكتب على الكرتون: «هذا الجانب للأعلى ↑».",
};

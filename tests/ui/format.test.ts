import { describe, expect, it } from "vitest";
import { AR } from "@/lib/engine/instructions.ar";
import { fmtAiSar, fmtApiError, fmtCartons, fmtClock, fmtCount, fmtDims, fmtMs, fmtPieces, fmtTime, pluralForm } from "@/lib/ui/format";

const LRI = "⁦";
const PDI = "⁩";

describe("Arabic count agreement", () => {
  it("uses singular, dual, plural and accusative singular forms", () => {
    expect(fmtPieces(1)).toBe("قطعة واحدة");
    expect(fmtPieces(2)).toBe("قطعتان");
    expect(fmtPieces(3)).toBe(`${LRI}3${PDI} قطع`);
    expect(fmtPieces(10)).toBe(`${LRI}10${PDI} قطع`);
    expect(fmtPieces(11)).toBe(`${LRI}11${PDI} قطعة`);
    expect(fmtPieces(0)).toBe(`${LRI}0${PDI} قطع`);
    expect(fmtCount(25, { one: "منتج", two: "منتجان", few: "منتجات", many: "منتجاً" })).toBe(`${LRI}25${PDI} منتجاً`);
  });

  it("pluralForm picks the same word fmtCount always used, and the orders page's waiting label", () => {
    const forms = { one: "طلب ينتظر", two: "طلبان ينتظران", few: "طلبات تنتظر", many: "طلباً ينتظر" };
    // The form choice fmtCount made before pluralForm existed.
    const before = (n: number) => {
      const abs = Math.abs(n);
      if (abs === 1) return forms.one;
      if (abs === 2) return forms.two;
      if (abs >= 3 && abs <= 10) return `${LRI}${n}${PDI} ${forms.few}`;
      if (abs >= 11) return `${LRI}${n}${PDI} ${forms.many}`;
      return `${LRI}${n}${PDI} ${forms.few}`;
    };
    for (const n of [0, 1, 2, 3, 7, 10, 10.5, 11, 12, 99, 100, 101, 1000, 2.5, -1, -2, -5, -11]) expect(fmtCount(n, forms)).toBe(before(n));
    expect([0, 1, 2, 3, 10, 11, 25].map((n) => pluralForm(n, forms))).toEqual([forms.few, forms.one, forms.two, forms.few, forms.few, forms.many, forms.many]);
  });
});

describe("dimensions and units", () => {
  it("keeps length × width × height in one LTR isolate with the unit outside", () => {
    expect(fmtDims([40, 30, 25])).toBe(`${LRI}40 × 30 × 25${PDI} سم`);
    expect(fmtDims([9, 9, null])).toBe("—");
  });

  it("writes the carton line in the catalog order with the same isolate", () => {
    expect(AR.carton("كبير L", [40, 30, 25])).toContain(`${LRI}40 × 30 × 25${PDI} سم`);
  });

  it("shows durations in seconds or milliseconds in Arabic", () => {
    expect(fmtMs(850)).toBe(`${LRI}850${PDI} ملّي ثانية`);
    expect(fmtMs(1800)).toBe(`${LRI}1.8${PDI} ثانية`);
  });
});

describe("dates and errors", () => {
  it("formats dates in the Gregorian calendar with Latin digits", () => {
    expect(fmtTime("2026-10-21T13:40:37Z")).toMatch(/2026/);
    expect(fmtTime("2026-10-21T13:40:37Z")).not.toMatch(/١٤٤٨|١٤٤٧/);
    expect(fmtTime("2026-10-21T13:40:37Z")).toMatch(/4:40:37/); // Riyadh is UTC+3 whatever the server's TZ
    expect(fmtClock("2026-10-21T13:40:37Z")).toMatch(/^4:40/);
  });

  it("shows AI cost in riyals, and says so when it is under a halala", () => {
    expect(fmtAiSar(0.0001)).toBe("أقل من هللة");
    expect(fmtAiSar(0.4)).toContain("1.50");
    expect(fmtAiSar(null)).toBe("—");
  });

  it("turns API errors into Arabic and passes Arabic through", () => {
    expect(fmtApiError("Order 9 not found")).toMatch(/[؀-ۿ]/);
    expect(fmtApiError("خطأ")).toBe("خطأ");
    expect(fmtApiError(undefined)).toMatch(/[؀-ۿ]/);
  });

  it("explains connected-store failures in Arabic instead of a generic error", () => {
    expect(fmtApiError("Could not reach the store's orders API: store API answered HTTP 502")).toContain("المتجر");
    expect(fmtApiError("Products not in Rassah's catalog yet: p-99")).toContain("غير مضافة");
    expect(fmtApiError("Run not found")).toBe("عملية التجهيز غير موجودة.");
  });
});

describe("fmtCartons", () => {
  it("uses the Arabic dual and plural", () => {
    expect(fmtCartons(1)).toBe("كرتون واحد");
    expect(fmtCartons(2)).toBe("كرتونين");
    expect(fmtCartons(3)).toBe("⁦3⁩ كراتين");
  });
});

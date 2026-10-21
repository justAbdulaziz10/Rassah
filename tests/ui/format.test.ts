import { describe, expect, it } from "vitest";
import { AR } from "@/lib/engine/instructions.ar";
import { fmtApiError, fmtCount, fmtDims, fmtMs, fmtPieces, fmtTime } from "@/lib/ui/format";

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
  });

  it("turns API errors into Arabic and passes Arabic through", () => {
    expect(fmtApiError("Order 9 not found")).toMatch(/[؀-ۿ]/);
    expect(fmtApiError("خطأ")).toBe("خطأ");
    expect(fmtApiError(undefined)).toMatch(/[؀-ۿ]/);
  });
});

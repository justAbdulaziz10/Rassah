import { describe, expect, it } from "vitest";
import { packUnits } from "@/lib/engine/packer";
import { smallerCartons } from "@/lib/engine/smaller";
import { fmtSmallerReason } from "@/lib/ui/format";
import { carton, CFG, RATES, unit } from "./helpers";

const LRI = "⁦";
const PDI = "⁩";

describe("smallerCartons", () => {
  const S = carton("S", [20, 15, 10], 3000, 0.9, 120);
  const M = carton("M", [30, 20, 15], 8000, 1.6, 250);
  const L = carton("L", [40, 30, 25], 15000, 2.6, 450);

  it("lists only cartons smaller than the chosen one, nearest in size first", () => {
    const units = [unit("a#1", [36, 10, 5])];
    const out = smallerCartons(L, [S, L, M], units, [
      { cartonId: "S", outcome: "oversize", strategy: null },
      { cartonId: "M", outcome: "oversize", strategy: null },
      { cartonId: "L", outcome: "packed", strategy: "x" },
    ]);
    expect(out.map((c) => c.id)).toEqual(["M", "S"]);
  });

  it("says how much the longest item overhangs in its best orientation", () => {
    const units = [unit("a#1", [36, 10, 5]), unit("b#1", [5, 5, 5])];
    const [m] = smallerCartons(L, [M, L], units, [{ cartonId: "M", outcome: "oversize", strategy: null }]);
    expect(m.reason).toEqual({ kind: "too_long", unitName: "a#1", overCm: 6 });
    expect(fmtSmallerReason(m.reason)).toBe(`ينقصه ${LRI}6${PDI} سم ليدخل فيه «a#1»`);
  });

  it("liquids may only turn about their upright axis, so a tall bottle overhangs the height", () => {
    const bottle = unit("oil#1", [32, 8, 8], { liquid: true, uprightHeight: 32 });
    const [m] = smallerCartons(L, [M, L], [bottle], [{ cartonId: "M", outcome: "oversize", strategy: null }]);
    expect(m.reason).toEqual({ kind: "too_long", unitName: "oil#1", overCm: 17 });
  });

  it("gives the weight the carton carries, its limit less its own weight", () => {
    const units = [unit("a#1", [10, 10, 10], { weightG: 2500 }), unit("b#1", [10, 10, 5], { weightG: 900 })];
    const [s] = smallerCartons(M, [S, M], units, [{ cartonId: "S", outcome: "overweight", strategy: null }]);
    expect(s.reason).toEqual({ kind: "too_heavy", itemsKg: 3.4, maxKg: 2.9 });
  });

  it("tells a carton too small in volume from one with no safe arrangement", () => {
    const big = [unit("a#1", [18, 14, 9]), unit("b#1", [18, 14, 9])];
    const [full] = smallerCartons(L, [S, L], big, [{ cartonId: "S", outcome: "no_layout", strategy: null }]);
    expect(full.reason).toEqual({ kind: "too_full", itemsLitres: 4.5, cartonLitres: 3 });
    const [none] = smallerCartons(L, [S, L], [unit("a#1", [5, 5, 5])], [{ cartonId: "S", outcome: "validator_rejected", strategy: null }]);
    expect(none.reason).toEqual({ kind: "no_layout" });
  });

  it("matches the packer's own attempts on a real search", () => {
    const units = [unit("a#1", [36, 10, 5], { weightG: 400 })];
    const r = packUnits(units, [S, M, L], { config: CFG, rates: RATES });
    expect(r.status).toBe("box_found");
    if (r.status !== "box_found") return;
    expect(r.carton.id).toBe("L");
    expect(smallerCartons(r.carton, [S, M, L], r.units, r.attempts).map((c) => c.reason.kind)).toEqual(["too_long", "too_long"]);
  });
});

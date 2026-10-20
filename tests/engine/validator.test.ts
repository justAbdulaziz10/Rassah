import { describe, expect, it } from "vitest";
import { validateLayout } from "@/lib/engine/validator";
import { VOPTS, carton, place, unit } from "./helpers";

const box = carton("C", [30, 20, 20], 5000);
const codes = (r: ReturnType<typeof validateLayout>) => r.violations.map((v) => v.code);

describe("validator: one failing layout per violation code", () => {
  it("out_of_bounds", () => {
    const u = [unit("a#1", [10, 10, 10])];
    const r = validateLayout(u, box, [place("a#1", 25, 0, 0, 10, 10, 10)], VOPTS);
    expect(codes(r)).toContain("out_of_bounds");
  });

  it("overlap", () => {
    const u = [unit("a#1", [10, 10, 10]), unit("b#1", [10, 10, 10])];
    const r = validateLayout(u, box, [place("a#1", 0, 0, 0, 10, 10, 10), place("b#1", 5, 5, 0, 10, 10, 10)], VOPTS);
    expect(codes(r)).toContain("overlap");
  });

  it("overweight (includes carton tare)", () => {
    const light = carton("L", [30, 20, 20], 1000, 1, 200);
    const u = [unit("a#1", [10, 10, 10], { weightG: 900 })];
    const r = validateLayout(u, light, [place("a#1", 0, 0, 0, 10, 10, 10)], VOPTS);
    expect(codes(r)).toContain("overweight");
  });

  it("floating", () => {
    const u = [unit("a#1", [10, 10, 10])];
    const r = validateLayout(u, box, [place("a#1", 0, 0, 5, 10, 10, 10)], VOPTS);
    expect(codes(r)).toContain("floating");
  });

  it("on_fragile", () => {
    const u = [unit("glass#1", [10, 10, 10], { fragile: true }), unit("book#1", [10, 10, 10])];
    const r = validateLayout(u, box, [place("glass#1", 0, 0, 0, 10, 10, 10), place("book#1", 0, 0, 10, 10, 10, 10)], VOPTS);
    expect(r.violations).toContainEqual(expect.objectContaining({ code: "on_fragile", unitId: "book#1" }));
  });

  it("liquid_tipped", () => {
    const u = [unit("oil#1", [6, 6, 15], { liquid: true, uprightHeight: 15 })];
    const r = validateLayout(u, box, [place("oil#1", 0, 0, 0, 15, 6, 6)], VOPTS);
    expect(codes(r)).toContain("liquid_tipped");
  });

  it("dim_mismatch", () => {
    const u = [unit("a#1", [10, 10, 10])];
    const r = validateLayout(u, box, [place("a#1", 0, 0, 0, 8, 10, 10)], VOPTS);
    expect(codes(r)).toContain("dim_mismatch");
  });

  it("missing_item", () => {
    const u = [unit("a#1", [10, 10, 10]), unit("b#1", [5, 5, 5])];
    const r = validateLayout(u, box, [place("a#1", 0, 0, 0, 10, 10, 10)], VOPTS);
    expect(r.violations).toContainEqual(expect.objectContaining({ code: "missing_item", unitId: "b#1" }));
  });

  it("duplicate_item (placed twice, and unknown unit)", () => {
    const u = [unit("a#1", [5, 5, 5])];
    const r = validateLayout(
      u,
      box,
      [place("a#1", 0, 0, 0, 5, 5, 5), place("a#1", 10, 0, 0, 5, 5, 5), place("zzz#1", 20, 0, 0, 5, 5, 5)],
      VOPTS,
    );
    expect(codes(r).filter((c) => c === "duplicate_item")).toHaveLength(2);
  });
});

describe("validator: allowed and boundary cases", () => {
  it("accepts exact wall contact and item-to-item contact", () => {
    const u = [unit("a#1", [15, 20, 20]), unit("b#1", [15, 20, 20])];
    const r = validateLayout(u, box, [place("a#1", 0, 0, 0, 15, 20, 20), place("b#1", 15, 0, 0, 15, 20, 20)], VOPTS);
    expect(r).toEqual({ valid: true, violations: [] });
  });

  it("50% support is floating, 80% support is fine", () => {
    const u = [unit("base#1", [10, 10, 5]), unit("top#1", [10, 10, 5])];
    const half = validateLayout(u, box, [place("base#1", 0, 0, 0, 10, 10, 5), place("top#1", 5, 0, 5, 10, 10, 5)], VOPTS);
    expect(codes(half)).toEqual(["floating"]);
    const most = validateLayout(u, box, [place("base#1", 0, 0, 0, 10, 10, 5), place("top#1", 2, 0, 5, 10, 10, 5)], VOPTS);
    expect(most.valid).toBe(true);
  });

  it("sums support across two items below", () => {
    const u = [unit("l#1", [5, 10, 5]), unit("r#1", [5, 10, 5]), unit("top#1", [10, 10, 5])];
    const r = validateLayout(
      u,
      box,
      [place("l#1", 0, 0, 0, 5, 10, 5), place("r#1", 5, 0, 0, 5, 10, 5), place("top#1", 0, 0, 5, 10, 10, 5)],
      VOPTS,
    );
    expect(r.valid).toBe(true);
  });

  it("reports all violations, not just the first", () => {
    const u = [unit("a#1", [10, 10, 10]), unit("b#1", [10, 10, 10])];
    const r = validateLayout(u, box, [place("a#1", 25, 0, 0, 10, 10, 10), place("b#1", 0, 0, 5, 10, 10, 10)], VOPTS);
    expect(new Set(codes(r))).toEqual(new Set(["out_of_bounds", "floating"]));
  });
});

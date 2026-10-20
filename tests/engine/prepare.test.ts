import { describe, expect, it } from "vitest";
import { prepareUnits } from "@/lib/engine/prepare";
import { CFG, facts } from "./helpers";

const line = (productId: string, qty = 1) => ({ productId, name: productId, qty });

describe("prepareUnits", () => {
  it("expands quantities into units with stable ids", () => {
    const r = prepareUnits([line("p-1", 2)], new Map([["p-1", facts("p-1")]]), CFG);
    expect(r.ok && r.units.map((u) => u.unitId)).toEqual(["p-1#1", "p-1#2"]);
  });

  it("sorts dimensions L >= W >= H", () => {
    const f = facts("p-1", { lengthCm: 5, widthCm: 20, heightCm: 10 });
    const r = prepareUnits([line("p-1")], new Map([["p-1", f]]), CFG);
    expect(r.ok && r.units[0].dims).toEqual([20, 10, 5]);
  });

  it("applies the safety margin only to inferred dimensions", () => {
    const page = prepareUnits([line("a")], new Map([["a", facts("a", { dimsSource: "page" })]]), CFG);
    const inferred = prepareUnits([line("a")], new Map([["a", facts("a", { dimsSource: "inferred" })]]), CFG);
    expect(page.ok && page.units[0].dims).toEqual([10, 10, 10]);
    expect(inferred.ok && inferred.units[0].dims).toEqual([11.5, 11.5, 11.5]);
    expect(inferred.ok && inferred.units[0].estimated).toBe(true);
  });

  it("pads only fragile or sensitive items", () => {
    const fragile = prepareUnits([line("a")], new Map([["a", facts("a", { fragile: true })]]), CFG);
    const sensitive = prepareUnits([line("a")], new Map([["a", facts("a", { sensitive: true })]]), CFG);
    const plain = prepareUnits([line("a")], new Map([["a", facts("a")]]), CFG);
    expect(fragile.ok && fragile.units[0].dims).toEqual([13, 13, 13]);
    expect(sensitive.ok && sensitive.units[0].dims).toEqual([13, 13, 13]);
    expect(plain.ok && plain.units[0].dims).toEqual([10, 10, 10]);
  });

  it("keeps the upright height for liquids", () => {
    const f = facts("oil", { lengthCm: 6, widthCm: 6, heightCm: 25, liquid: true });
    const r = prepareUnits([line("oil")], new Map([["oil", f]]), CFG);
    expect(r.ok && r.units[0].uprightHeight).toBe(25);
  });

  it("returns needs_measurement for unknown or missing facts", () => {
    const r = prepareUnits(
      [line("ok"), line("unknown"), line("missing")],
      new Map([
        ["ok", facts("ok")],
        ["unknown", facts("unknown", { dimsSource: "unknown", lengthCm: null })],
      ]),
      CFG,
    );
    expect(r).toEqual({ ok: false, kind: "needs_measurement", productIds: ["unknown", "missing"] });
  });

  it("rejects orders above the unit cap", () => {
    const r = prepareUnits([line("a", CFG.maxUnits + 1)], new Map([["a", facts("a")]]), CFG);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("invalid_input");
  });
});

import { describe, expect, it } from "vitest";
import { packOrder } from "@/lib/engine";
import { splitPack } from "@/lib/engine/split";
import { validateLayout } from "@/lib/engine/validator";
import { CFG, RATES, VOPTS, carton, facts, unit } from "./helpers";

const CARTONS = [carton("S", [20, 15, 10], 3000, 0.9), carton("M", [30, 20, 15], 8000, 1.6)];
const opts = { config: CFG, rates: RATES };

describe("splitPack", () => {
  it("splits an order too heavy for any one carton, every unit exactly once, every box valid", () => {
    const units = [1, 2, 3, 4].map((i) => unit(`w#${i}`, [10, 10, 10], { weightG: 3500 }));
    const plan = splitPack(units, CARTONS, opts);
    expect(plan).not.toBeNull();
    expect(plan!.boxes.length).toBe(2);
    const placed = plan!.boxes.flatMap((b) => b.placements.map((p) => p.unitId)).sort();
    expect(placed).toEqual(units.map((u) => u.unitId).sort());
    for (const b of plan!.boxes) {
      expect(validateLayout(b.units, b.carton, b.placements, VOPTS).valid).toBe(true);
      expect(b.instructions[0].unitId).toBeNull();
    }
    expect(plan!.totalSar).toBeCloseTo(
      plan!.boxes.reduce((s, b) => s + b.cost.totalSar, 0),
      2,
    );
  });

  it("keeps the upright and fragile rules inside each box", () => {
    const units = [
      unit("bottle#1", [14, 8, 8], {
        liquid: true,
        uprightHeight: 14,
        weightG: 2000,
      }),
      unit("glass#1", [12, 12, 10], { fragile: true, weightG: 2000 }),
      unit("brick#1", [14, 14, 9], { weightG: 3000 }),
      unit("brick#2", [14, 14, 9], { weightG: 3000 }),
    ];
    const plan = splitPack(units, CARTONS, opts);
    expect(plan).not.toBeNull();
    for (const b of plan!.boxes) expect(validateLayout(b.units, b.carton, b.placements, VOPTS).violations).toEqual([]);
  });

  it("gives up when one unit fits no carton on its own", () => {
    expect(splitPack([unit("huge#1", [60, 10, 10]), unit("a#1", [5, 5, 5])], CARTONS, opts)).toBeNull();
  });

  it("does not split a single unit", () => {
    expect(splitPack([unit("anvil#1", [10, 10, 10], { weightG: 20_000 })], CARTONS, opts)).toBeNull();
  });
});

describe("packOrder with a split", () => {
  it("keeps status no_box and attaches the split suggestion", () => {
    const f = new Map([["w", facts("w", { weightG: 3500 })]]);
    const r = packOrder([{ productId: "w", name: "w", qty: 4 }], f, CARTONS, RATES, CFG);
    expect(r.status).toBe("no_box");
    expect(r.status === "no_box" && r.split?.boxes.length).toBe(2);
  });

  it("does not split when one carton fits", () => {
    const f = new Map([["w", facts("w", { weightG: 500 })]]);
    const r = packOrder([{ productId: "w", name: "w", qty: 2 }], f, CARTONS, RATES, CFG);
    expect(r.status).toBe("box_found");
    expect("split" in r && r.split).toBeFalsy();
  });
});

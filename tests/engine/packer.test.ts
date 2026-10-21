import { describe, expect, it } from "vitest";
import { packOrder } from "@/lib/engine";
import { packUnits } from "@/lib/engine/packer";
import { validateLayout } from "@/lib/engine/validator";
import type { Unit } from "@/lib/engine/types";
import { CFG, RATES, VOPTS, carton, facts, rng, unit } from "./helpers";

const CARTONS = [
  carton("S", [20, 15, 10], 3000, 0.9),
  carton("M", [30, 20, 15], 8000, 1.6),
  carton("L", [40, 30, 25], 15000, 2.6),
];
const opts = { config: CFG, rates: RATES };

function onTopOf(top: { x: number; y: number; z: number; dx: number; dy: number }, below: { x: number; y: number; z: number; dx: number; dy: number; dz: number }) {
  const ox = Math.min(top.x + top.dx, below.x + below.dx) - Math.max(top.x, below.x);
  const oy = Math.min(top.y + top.dy, below.y + below.dy) - Math.max(top.y, below.y);
  return Math.abs(below.z + below.dz - top.z) < 1e-6 && ox > 1e-6 && oy > 1e-6;
}

describe("packUnits", () => {
  it("chooses the smallest valid carton for a simple order", () => {
    const r = packUnits([unit("a#1", [10, 8, 5]), unit("b#1", [8, 6, 4])], CARTONS, opts);
    expect(r.status).toBe("box_found");
    expect(r.status === "box_found" && r.carton.id).toBe("S");
  });

  it("returns no_box with reason oversize when an item fits no carton", () => {
    const r = packUnits([unit("huge#1", [60, 10, 10])], CARTONS, opts);
    expect(r.status).toBe("no_box");
    expect(r.attempts.every((a) => a.outcome === "oversize")).toBe(true);
    expect(r.status === "no_box" && r.reason).toBe("No valid carton found within the search budget");
  });

  it("returns no_box with reason overweight when every carton is too weak", () => {
    const r = packUnits([unit("anvil#1", [10, 10, 10], { weightG: 20_000 })], CARTONS, opts);
    expect(r.status).toBe("no_box");
    expect(r.attempts.every((a) => a.outcome === "overweight")).toBe(true);
  });

  it("never puts anything on top of a fragile item", () => {
    const units = [
      unit("glass#1", [10, 10, 8], { fragile: true }),
      unit("book#1", [18, 13, 3]),
      unit("book#2", [18, 13, 3]),
      unit("box#1", [10, 10, 6]),
    ];
    const r = packUnits(units, CARTONS, opts);
    expect(r.status).toBe("box_found");
    if (r.status !== "box_found") return;
    const glass = r.placements.find((p) => p.unitId === "glass#1")!;
    expect(r.placements.some((p) => p !== glass && onTopOf(p, glass))).toBe(false);
  });

  it("keeps liquids upright", () => {
    const oil = unit("oil#1", [7, 7, 14], { liquid: true, uprightHeight: 14 });
    const r = packUnits([oil, unit("b#1", [12, 10, 4])], CARTONS, opts);
    expect(r.status).toBe("box_found");
    if (r.status !== "box_found") return;
    expect(r.placements.find((p) => p.unitId === "oil#1")!.dz).toBe(14);
  });

  it("stands a thin item on its side to fill an exact strip (regression: fixture feasible-05)", () => {
    // Exact tiling of FLAT 35x25x6: 12.3 + 19.3 + 3.4 = 35. Only works if the 3.4 cm item stands up.
    const units = [
      unit("glass#1", [25, 12.3, 6], { fragile: true, weightG: 825 }),
      unit("box#1", [25, 19.3, 6], { weightG: 457 }),
      unit("thin#1", [25, 6, 3.4], { weightG: 575 }),
    ];
    const r = packUnits(units, [carton("FLAT", [35, 25, 6], 3000, 1.1, 150)], opts);
    expect(r.status).toBe("box_found");
  });

  it("is deterministic", () => {
    const units = [unit("a#1", [12, 9, 5]), unit("b#1", [10, 8, 7], { fragile: true }), unit("c#1", [9, 9, 9])];
    const fixedClock = () => 0;
    const a = packUnits(units, CARTONS, { ...opts, now: fixedClock });
    const b = packUnits(units, CARTONS, { ...opts, now: fixedClock });
    expect(a).toEqual(b);
  });

  it("stops at the search budget and says so", () => {
    let t = 0;
    const clock = () => (t += 1000); // every clock read jumps 1 s, so the budget runs out immediately
    const r = packUnits([unit("a#1", [5, 5, 5]), unit("b#1", [5, 5, 5])], CARTONS, { ...opts, now: clock });
    expect(r.status).toBe("no_box");
    expect(r.attempts.some((x) => x.outcome === "search_budget")).toBe(true);
  });
});

describe("property: every returned layout passes the independent validator", () => {
  it("holds for 200 seeded random orders", () => {
    const rand = rng(20261022);
    const cartons = [...CARTONS, carton("XL", [50, 40, 35], 20000, 3.8), carton("FLAT", [35, 25, 6], 3000, 1.1)];
    let found = 0;
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(rand() * 8);
      const units: Unit[] = [];
      for (let k = 0; k < n; k++) {
        const liquid = rand() < 0.2;
        const dims: [number, number, number] = [3 + rand() * 22, 3 + rand() * 18, 2 + rand() * 15].map(
          (d) => Math.round(d * 10) / 10,
        ) as [number, number, number];
        units.push(
          unit(`p${k}#1`, dims, {
            weightG: Math.round(50 + rand() * 1500),
            fragile: rand() < 0.25,
            liquid,
            uprightHeight: liquid ? dims[2] : null,
          }),
        );
      }
      const r = packUnits(units, cartons, { ...opts, now: () => 0 });
      expect(r.validatorRejections).toBe(0);
      if (r.status === "box_found") {
        found++;
        expect(validateLayout(units, r.carton, r.placements, VOPTS)).toEqual({ valid: true, violations: [] });
      }
    }
    expect(found).toBeGreaterThan(100); // sanity: most random orders should pack
  }, 30_000); // 200 full searches; slow CI runners exceed the 5 s default
});

describe("performance", () => {
  it("packs a 12-unit order within the search budget", () => {
    const units = Array.from({ length: 12 }, (_, i) =>
      unit(`p${i}#1`, [8 + (i % 4), 6 + (i % 3), 4 + (i % 5)], { fragile: i % 5 === 0 }),
    );
    const t0 = performance.now();
    const r = packUnits(units, [...CARTONS, carton("XL", [50, 40, 35], 20000, 3.8)], opts);
    expect(performance.now() - t0).toBeLessThan(CFG.maxSearchMs);
    expect(r.status).toBe("box_found");
  });
});

describe("packOrder (facts → result + instructions)", () => {
  it("returns needs_measurement instead of guessing", () => {
    const r = packOrder(
      [{ productId: "x", name: "x", qty: 1 }],
      new Map([["x", facts("x", { dimsSource: "unknown", lengthCm: null })]]),
      CARTONS,
      RATES,
    );
    expect(r).toEqual({ status: "needs_measurement", productIds: ["x"] });
  });

  it("returns instructions with a box", () => {
    const r = packOrder([{ productId: "a", name: "كتاب", qty: 1 }], new Map([["a", facts("a")]]), CARTONS, RATES);
    expect(r.status).toBe("box_found");
    expect(r.status === "box_found" && r.instructions!.length).toBeGreaterThan(2);
  });
});

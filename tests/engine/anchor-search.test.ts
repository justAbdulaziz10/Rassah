import { describe, expect, it } from "vitest";
import { loadCartons, loadPackingFixtures } from "@/lib/data/load";
import { baselinePack } from "@/lib/engine/baseline";
import { anchorPack, packUnits } from "@/lib/engine/packer";
import type { Unit } from "@/lib/engine/types";
import { validateLayout } from "@/lib/engine/validator";
import { CFG, RATES, VOPTS, carton, unit } from "./helpers";

const { fixtures } = loadPackingFixtures();
const { cartons: catalog } = loadCartons();

function fixtureCase(id: string) {
  const f = fixtures.find((x) => x.id === id);
  if (!f) throw new Error(`fixture ${id} not found`);
  const units: Unit[] = f.units.map((u) => ({
    unitId: u.unitId,
    productId: u.unitId.split("#")[0],
    name: u.unitId,
    dims: u.dims,
    baseDims: u.dims,
    weightG: u.weightG,
    fragile: u.fragile,
    liquid: u.liquid,
    sensitive: false,
    estimated: false,
    uprightHeight: u.uprightHeight,
  }));
  return { units, cartons: catalog.filter((c) => f.cartonIds.includes(c.id)) };
}

// engine-0.1 (greedy passes + 40 seeded restarts) found no layout for these exact fills.
// Each needs a specific mix of flat and standing orientations (and, for 03/07, an upright liquid).
const PREVIOUSLY_MISSED = ["feasible-03", "feasible-06", "feasible-07", "feasible-09", "feasible-20"];

describe("anchor search: regressions for the fixtures engine-0.1 missed", () => {
  for (const id of PREVIOUSLY_MISSED) {
    it(`packs ${id} in its witness carton with a validated layout`, () => {
      const { units, cartons } = fixtureCase(id);
      const r = packUnits(units, cartons, { config: CFG, rates: RATES, now: () => 0 });
      expect(r.status).toBe("box_found");
      if (r.status !== "box_found") return;
      expect(r.validatorRejections).toBe(0);
      expect(validateLayout(units, r.carton, r.placements, VOPTS)).toEqual({ valid: true, violations: [] });
    });
  }
});

describe("anchor search on its own", () => {
  it("solves every zero-slack known-feasible fixture (complete for gap-free packings)", () => {
    for (const f of fixtures.filter((x) => x.group === "known_feasible")) {
      const { units, cartons } = fixtureCase(f.id);
      const r = anchorPack(units, cartons[0], CFG);
      expect(r.placements, f.id).not.toBeNull();
      expect(validateLayout(units, cartons[0], r.placements!, VOPTS).valid, f.id).toBe(true);
      expect(r.nodes, f.id).toBeLessThanOrEqual(CFG.anchorNodes);
    }
  });

  it("leaves a gap when the carton has slack (one top piece of an exact fill removed)", () => {
    // Witness in S 20x15x10: 9.7x10.4x5.4 | 10.3x10.4x5.4 side by side, a 20x4.6x3.9 strip
    // behind them, then 11.1x10.4x4.6 and 8.9x10.4x4.6 on top. The space above the strip stays empty.
    const units = [
      unit("strip#1", [20, 4.6, 3.9]),
      unit("a#1", [10.4, 10.3, 5.4]),
      unit("b#1", [10.4, 9.7, 5.4]),
      unit("c#1", [11.1, 10.4, 4.6]),
      unit("d#1", [10.4, 8.9, 4.6]),
    ];
    const s = carton("S", [20, 15, 10], 3000, 0.9);
    const alone = anchorPack(units, s, CFG);
    expect(alone.placements).not.toBeNull();
    expect(validateLayout(units, s, alone.placements!, VOPTS).valid).toBe(true);

    const r = packUnits(units, [s], { config: CFG, rates: RATES, now: () => 0 });
    expect(r.status).toBe("box_found");
    if (r.status === "box_found") expect(validateLayout(units, s, r.placements, VOPTS).valid).toBe(true);
  });

  it("keeps every rule: no item on a fragile one, liquids upright, enough support", () => {
    const units = fixtureCase("feasible-07").units; // has a fragile top item and an upright liquid
    const s = catalog.find((c) => c.id === "S")!;
    const r = anchorPack(units, s, CFG);
    expect(r.placements).not.toBeNull();
    const liquid = units.find((u) => u.liquid)!;
    expect(r.placements!.find((p) => p.unitId === liquid.unitId)!.dz).toBe(liquid.uprightHeight);
    expect(validateLayout(units, s, r.placements!, VOPTS).violations).toEqual([]);
  });

  it("gives up within its node limit instead of searching forever", () => {
    // random-10 in carton M: 68% fill but no layout found; the search runs into its node limit.
    const { units } = fixtureCase("random-10");
    const m = catalog.find((c) => c.id === "M")!;
    const r = anchorPack(units, m, CFG, 50);
    expect(r.placements).toBeNull();
    expect(r.nodes).toBe(51); // the node that crossed the limit stops the search
  });
});

describe("naive baseline respects carton weight limits", () => {
  it("skips a carton that is too weak and uses the next one", () => {
    const units = [unit("brick#1", [10, 10, 5], { weightG: 2_950 })];
    const r = baselinePack(units, [carton("S", [20, 15, 10], 3000, 0.9, 120), carton("M", [30, 20, 15], 8000, 1.6, 250)]);
    expect(r?.carton.id).toBe("M");
  });

  it("returns no layout when every carton is too weak", () => {
    const units = [unit("anvil#1", [10, 10, 10], { weightG: 25_000 })];
    expect(baselinePack(units, [carton("S", [20, 15, 10], 3000, 0.9)])).toBeNull();
  });
});

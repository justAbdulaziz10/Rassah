import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackNoBox } from "@/lib/engine/types";
import { CFG, RATES, carton, facts } from "./helpers";

// The main search fails once (as when it runs out of time); every later call, including the
// split's own searches, is the real packer.
const control = vi.hoisted(() => ({ failNext: false }));
vi.mock("@/lib/engine/packer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/engine/packer")>();
  return {
    ...real,
    packUnits: (...args: Parameters<typeof real.packUnits>) => {
      if (control.failNext) {
        control.failNext = false;
        const miss: PackNoBox = {
          status: "no_box",
          reason: "No valid carton found within the search budget",
          attempts: [],
          candidatesChecked: 0,
          validatorRejections: 0,
          violations: [],
          searchMs: 1500,
        };
        return miss;
      }
      return real.packUnits(...args);
    },
  };
});

const { packOrder } = await import("@/lib/engine");

const CARTONS = [carton("S", [20, 15, 10], 3000, 0.9), carton("M", [30, 20, 15], 8000, 1.6)];

describe("packOrder when the split finds a single carton", () => {
  beforeEach(() => {
    control.failNext = true;
  });

  it("answers box_found with the carton, layout, cost and instructions, not no_box with split_1", () => {
    const r = packOrder([{ productId: "a", name: "a", qty: 2 }], new Map([["a", facts("a")]]), CARTONS, RATES, CFG, () => 0);
    expect(r.status).toBe("box_found");
    if (r.status !== "box_found") return;
    expect(r.carton.id).toBe("S");
    expect(r.placements.map((p) => p.unitId).sort()).toEqual(["a#1", "a#2"]);
    expect(r.units).toHaveLength(2);
    expect(r.cost.totalSar).toBeGreaterThan(0);
    expect(r.instructions!.length).toBeGreaterThan(2);
    expect(r.strategy).not.toMatch(/^split_/);
    expect("split" in r).toBe(false);
    expect(r.searchMs).toBeGreaterThanOrEqual(1500); // the failed main search counts towards the time
  });

  it("still reports a real split of two or more boxes as no_box with the plan", () => {
    const f = new Map([["w", facts("w", { weightG: 3500 })]]);
    const r = packOrder([{ productId: "w", name: "w", qty: 4 }], f, CARTONS, RATES, CFG, () => 0);
    expect(r.status).toBe("no_box");
    expect(r.status === "no_box" && r.split?.boxes.length).toBe(2);
  });
});

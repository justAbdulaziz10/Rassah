import { describe, expect, it } from "vitest";
import { binPackingRequest, cartonPriceHalalas, paccurateRequest, parseBinPacking, parsePaccurate } from "@/lib/bench/competitors";
import type { Carton, ShippingRates, Unit } from "@/lib/engine/types";
import { validateLayout } from "@/lib/engine/validator";

const rates: ShippingRates = { baseSar: 18, perKgSar: 3, volumetricDivisor: 5000 };
const box: Carton = { id: "M", name: "M", inner: [30, 20, 15], maxWeightG: 8000, tareG: 250, costSar: 1.6 };
const other: Carton = { id: "S", name: "S", inner: [20, 15, 10], maxWeightG: 3000, tareG: 120, costSar: 0.9 };

function unit(id: string, dims: [number, number, number], over: Partial<Unit> = {}): Unit {
  return { unitId: id, productId: id.split("#")[0], name: id, dims, baseDims: dims, weightG: 500, fragile: false, liquid: false, sensitive: false, estimated: false, uprightHeight: null, ...over };
}

// A bottle that must stand 18 cm tall, and a fragile box that nothing may sit on.
const bottle = unit("p-10#1", [18, 9, 9], { liquid: true, uprightHeight: 18 });
const glass = unit("p-05#1", [12, 12, 10], { fragile: true });
const units = [bottle, glass];
const VOPTS = { minSupport: 0.7, eps: 1e-6 };

describe("benchmark adapters", () => {
  it("prices every carton the same way for every vendor: carton + shipping at its own volumetric weight", () => {
    // M outer 31x21x16 = 10416 cm3 / 5000 = 2.08 kg → 3 started kg → 18 + 2*3 = 24 SAR, + 1.6 carton.
    expect(cartonPriceHalalas(box, rates, 0.5)).toBe(2560);
  });

  it("Paccurate: sends the upright height on its vertical axis (x) and both rules", () => {
    const req = paccurateRequest(units, [box, other], rates, 0.5);
    expect(req.itemSets[0].dimensions).toEqual({ x: 18, y: 9, z: 9 });
    expect(req.boxTypes[0].dimensions).toEqual({ x: 15, y: 20, z: 30 });
    expect(req.rules).toEqual([
      { operation: "lock-orientation", itemRefId: 0, options: { freeAxes: [0] } },
      { operation: "fragile", itemRefId: 1, options: { onTopOnly: true } },
    ]);
  });

  it("Paccurate: maps a response back to our axes, skips virtual volumes, and the layout validates", () => {
    // The 18 cm bottle needs a box at least 18 cm tall.
    const tall: Carton = { ...box, id: "T", inner: [30, 20, 20] };
    const res = {
      boxes: [
        {
          box: {
            boxType: { refId: 0, name: "T" },
            items: [
              { item: { refId: 0, origin: { x: 0, y: 0, z: 0 }, dimensions: { x: 18, y: 9, z: 9 } } },
              { item: { refId: 1, origin: { x: 0, y: 0, z: 9 }, dimensions: { x: 10, y: 12, z: 12 } } },
              { item: { refId: 1, virtual: true, origin: { x: 10, y: 0, z: 9 }, dimensions: { x: 5, y: 12, z: 12 } } },
            ],
          },
        },
      ],
      leftovers: [],
      packTime: 0.004,
    };
    const a = parsePaccurate(res, units, [tall]);
    expect(a.engineMs).toBe(4);
    expect(a.boxes[0].placements).toEqual([
      { unitId: "p-10#1", x: 0, y: 0, z: 0, dx: 9, dy: 9, dz: 18 },
      { unitId: "p-05#1", x: 9, y: 0, z: 0, dx: 12, dy: 12, dz: 10 },
    ]);
    expect(validateLayout(units, tall, a.boxes[0].placements, VOPTS).valid).toBe(true);
  });

  it("3DBinPacking: liquids may not be turned (vr 0), fragile has no rule to send", () => {
    const req = binPackingRequest(units, [box], rates, 0.5, { username: "u", apiKey: "k" });
    expect(req.items[0]).toMatchObject({ id: "p-10#1", h: 18, vr: 0 });
    expect(req.items[1]).toMatchObject({ id: "p-05#1", vr: 1 });
    expect(req.bins[0]).toMatchObject({ id: "M", w: 30, h: 15, d: 20, max_wg: 7750 });
  });

  it("3DBinPacking: reads y as vertical, and falls back to z when only that reading fits the box", () => {
    const tall: Carton = { ...box, inner: [30, 20, 20] };
    const yUp = {
      response: {
        status: 1,
        bins_packed: [{ bin_data: { id: "M" }, items: [{ id: "p-10#1", coordinates: { x1: 0, y1: 0, z1: 0, x2: 9, y2: 18, z2: 9 } }, { id: "p-05#1", coordinates: { x1: 9, y1: 0, z1: 0, x2: 21, y2: 10, z2: 12 } }] }],
        not_packed_items: [],
      },
    };
    const a = parseBinPacking(yUp, units, [tall]);
    expect(a.note).toBeUndefined();
    expect(a.boxes[0].placements[0]).toEqual({ unitId: "p-10#1", x: 0, y: 0, z: 0, dx: 9, dy: 9, dz: 18 });
    expect(validateLayout(units, tall, a.boxes[0].placements, VOPTS).valid).toBe(true);

    // A 24 cm side fits the 25 cm width but not the 20 cm height, so only the z-up reading is possible.
    const long = unit("p-30#1", [24, 12, 10]);
    const wide: Carton = { ...box, inner: [30, 25, 20] };
    const zUp = {
      response: {
        status: 1,
        bins_packed: [{ bin_data: { id: "M" }, items: [{ id: "p-30#1", coordinates: { x1: 0, y1: 0, z1: 0, x2: 12, y2: 24, z2: 10 } }] }],
        not_packed_items: [{ id: "p-10#1", q: 1 }],
      },
    };
    const b = parseBinPacking(zUp, [bottle, long], [wide]);
    expect(b.boxes[0].placements[0]).toEqual({ unitId: "p-30#1", x: 0, y: 0, z: 0, dx: 12, dy: 24, dz: 10 });
    expect(b.note).toMatch(/z vertical/);
    expect(b.unpacked).toEqual(["p-10#1"]);
  });

  it("3DBinPacking: a critical error is an error, not an empty answer", () => {
    expect(() => parseBinPacking({ response: { status: 0, errors: [{ level: "critical", message: "api_key missing" }] } }, units, [box])).toThrow(/api_key/);
  });
});

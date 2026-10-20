import { describe, expect, it } from "vitest";
import { cartonThreeSize, itemKind, placementOrder, toThreePosition, toThreeSize } from "@/lib/ui/three";

const inner: [number, number, number] = [30, 20, 15];

describe("3D helpers", () => {
  it("maps engine z-up to three.js y-up and centres on the carton floor", () => {
    // A 10x6x4 box in the back-left floor corner.
    const p = { x: 0, y: 0, z: 0, dx: 10, dy: 6, dz: 4 };
    expect(toThreePosition(p, inner)).toEqual([5 - 15, 2, 3 - 10]);
    expect(toThreeSize(p)).toEqual([10, 4, 6]);
  });

  it("puts a stacked box's centre at its base height + half its height", () => {
    const p = { x: 10, y: 5, z: 4, dx: 4, dy: 2, dz: 6 };
    expect(toThreePosition(p, inner)[1]).toBe(7);
  });

  it("carton size swaps height into three.js y", () => {
    expect(cartonThreeSize(inner)).toEqual([30, 15, 20]);
  });

  it("color kind follows the fixed priority fragile > liquid > sensitive", () => {
    expect(itemKind({ fragile: true, liquid: true, sensitive: true })).toBe("fragile");
    expect(itemKind({ fragile: false, liquid: true, sensitive: true })).toBe("liquid");
    expect(itemKind({ fragile: false, liquid: false, sensitive: true })).toBe("sensitive");
    expect(itemKind({ fragile: false, liquid: false, sensitive: false })).toBe("plain");
  });

  it("orders steps bottom-to-top like the written instructions", () => {
    const items = [
      { id: "top", placement: { x: 0, y: 0, z: 5, dx: 1, dy: 1, dz: 1 } },
      { id: "floor-back", placement: { x: 3, y: 0, z: 0, dx: 1, dy: 1, dz: 1 } },
      { id: "floor-front", placement: { x: 0, y: 4, z: 0, dx: 1, dy: 1, dz: 1 } },
    ];
    expect(placementOrder(items).map((i) => i.id)).toEqual(["floor-back", "floor-front", "top"]);
  });
});

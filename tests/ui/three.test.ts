import { describe, expect, it } from "vitest";
import { buildInstructions } from "@/lib/engine/instructions";
import { cartonThreeSize, itemKind, placementOrder, topViewRects, toThreePosition, toThreeSize, voidFillBubbles } from "@/lib/ui/three";
import { carton, place, unit } from "../engine/helpers";

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

  it("item k in the 3D view is written step k + 1, after the carton step", () => {
    // PackingView3D numbers its steps this way; the written list must agree for every item.
    const units = [unit("book#1", [20, 15, 3]), unit("charger#1", [8, 6, 4]), unit("oil#1", [10, 6, 6], { liquid: true }), unit("mug#1", [10, 9, 9], { fragile: true })];
    const placements = [place("mug#1", 0, 15, 3, 10, 9, 9), place("charger#1", 10, 15, 3, 8, 6, 4), place("book#1", 0, 0, 0, 20, 15, 3), place("oil#1", 20, 0, 0, 10, 6, 6)];
    const steps = buildInstructions(carton("M", [30, 25, 15]), placements, units, 1);
    const items = placements.map((p) => ({ unitId: p.unitId, placement: p }));
    expect(steps[0]).toMatchObject({ step: 1, unitId: null });
    placementOrder(items).forEach((it, i) => {
      expect(steps.find((s) => s.unitId === it.unitId)?.step).toBe(i + 1 + 1);
    });
    // The 3D filler view after the last item is the written "fill the gaps" step.
    expect(steps[items.length + 1]).toMatchObject({ step: items.length + 2, unitId: null });
    expect(steps[items.length + 1].text).toContain("املأ الفراغات");
  });

  it("top view paints lower tops first so stacked items stay visible", () => {
    const items = [
      { id: "tall", placement: { x: 0, y: 0, z: 0, dx: 4, dy: 4, dz: 10 } },
      { id: "stacked", placement: { x: 5, y: 0, z: 3, dx: 2, dy: 2, dz: 2 } },
      { id: "flat", placement: { x: 5, y: 0, z: 0, dx: 6, dy: 6, dz: 3 } },
    ];
    expect(topViewRects(items).map((i) => i.id)).toEqual(["flat", "stacked", "tall"]);
  });

  it("top view breaks equal tops by base height, then y, then x", () => {
    const items = [
      { id: "high-base", placement: { x: 0, y: 0, z: 2, dx: 1, dy: 1, dz: 2 } },
      { id: "front", placement: { x: 0, y: 3, z: 0, dx: 1, dy: 1, dz: 4 } },
      { id: "back-right", placement: { x: 2, y: 0, z: 0, dx: 1, dy: 1, dz: 4 } },
      { id: "back-left", placement: { x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 4 } },
    ];
    expect(topViewRects(items).map((i) => i.id)).toEqual(["back-left", "back-right", "front", "high-base"]);
  });

  it("top view maps x/y to the rect and leaves the input untouched", () => {
    const items = [
      { id: "b", placement: { x: 3, y: 2, z: 1, dx: 5, dy: 4, dz: 1 } },
      { id: "a", placement: { x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1 } },
    ];
    const before = structuredClone(items);
    const rects = topViewRects(items);
    expect(items).toEqual(before);
    expect(rects[1]).toMatchObject({ id: "b", rx: 3, ry: 2, rw: 5, rh: 4 });
  });
});

describe("voidFillBubbles", () => {
  const inner = [30, 20, 10] as const;
  const item = { x: 0, y: 0, z: 0, dx: 15, dy: 20, dz: 10 }; // fills the left half

  it("fills only the cells no item touches, up to the carton's top", () => {
    const { positions, radius } = voidFillBubbles(inner, [item]);
    expect(positions.length).toBeGreaterThan(0);
    expect(radius).toBeGreaterThan(0);
    // three.js x = engine x - L/2: the left half (x < 0) holds the item, so every bubble is on the right.
    for (const [x, y] of positions) {
      expect(x).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(inner[2]);
    }
  });

  it("a full carton gets no bubbles, an empty one is filled, and the count stays bounded", () => {
    expect(voidFillBubbles(inner, [{ x: 0, y: 0, z: 0, dx: 30, dy: 20, dz: 10 }]).positions).toHaveLength(0);
    const empty = voidFillBubbles(inner, [], 14);
    expect(empty.positions.length).toBeGreaterThan(0);
    expect(empty.positions.length).toBeLessThanOrEqual(14 ** 3);
  });
});

// Pure helpers for the 3D view (unit-tested). The engine is z-up; three.js is y-up.

export interface BoxPlacement {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/** One placed unit as the carton views draw it (3D view, 2D top view, landing hero). */
export interface ViewItem {
  unitId: string;
  name?: string;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
  /** Size is a guess: drawn see-through. */
  estimated: boolean;
  placement: BoxPlacement;
}

/** Engine (x, y, z) with z up → three.js (x, y, z) with y up, centred on the carton floor. */
export function toThreePosition(p: BoxPlacement, inner: readonly [number, number, number]): [number, number, number] {
  const [L, W] = inner;
  // three.js positions a box by its centre, so origin + size/2.
  return [p.x + p.dx / 2 - L / 2, p.z + p.dz / 2, p.y + p.dy / 2 - W / 2];
}

/** Box size in three.js axis order (x, y-up, z). */
export function toThreeSize(p: BoxPlacement): [number, number, number] {
  return [p.dx, p.dz, p.dy];
}

export function cartonThreeSize(inner: readonly [number, number, number]): [number, number, number] {
  return [inner[0], inner[2], inner[1]];
}

export type ItemKind = "fragile" | "liquid" | "sensitive" | "plain";

export function itemKind(flags: { fragile: boolean; liquid: boolean; sensitive: boolean }): ItemKind {
  if (flags.fragile) return "fragile";
  if (flags.liquid) return "liquid";
  if (flags.sensitive) return "sensitive";
  return "plain";
}

/** Same color meaning as the rest of the app (see app/globals.css). */
export const KIND_COLOR: Record<ItemKind, string> = {
  fragile: "#d97706",
  liquid: "#2563eb",
  sensitive: "#7c3aed",
  plain: "#5f8f8a",
};

/** Placement order used by the instructions: bottom to top, then back to front, then left to right. */
export function placementOrder<T extends { placement: BoxPlacement }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.placement.z - b.placement.z || a.placement.y - b.placement.y || a.placement.x - b.placement.x);
}

/** Rects for the 2D top-down fallback (x along the length, y along the width). Lower tops paint first so stacked items show on top. */
export function topViewRects<T extends { placement: BoxPlacement }>(items: T[]): Array<T & { rx: number; ry: number; rw: number; rh: number }> {
  return [...items]
    .sort((a, b) => {
      const pa = a.placement;
      const pb = b.placement;
      return pa.z + pa.dz - (pb.z + pb.dz) || pa.z - pb.z || pa.y - pb.y || pa.x - pb.x;
    })
    .map((it) => ({ ...it, rx: it.placement.x, ry: it.placement.y, rw: it.placement.dx, rh: it.placement.dy }));
}

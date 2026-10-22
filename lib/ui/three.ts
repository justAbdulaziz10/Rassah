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

/**
 * Bubble-wrap filler for the last 3D step: one bubble per grid cell of the carton that no item
 * touches, up to the carton's top, so the packer sees the gaps filled. At most `perSide` cells
 * along the longest side keeps the count small (≤ perSide³). Positions are three.js (y-up).
 */
export function voidFillBubbles(
  inner: readonly [number, number, number],
  placements: BoxPlacement[],
  perSide = 10,
): { radius: number; positions: Array<[number, number, number]> } {
  const [L, W, H] = inner;
  const cell = Math.max(L, W, H) / perSide;
  const n = [L, W, H].map((side) => Math.max(1, Math.round(side / cell)));
  const [cx, cy, cz] = [L / n[0], W / n[1], H / n[2]];
  const eps = 1e-6;
  const overlaps = (lo: number, hi: number, start: number, size: number) => lo < start + size - eps && hi > start + eps;
  const positions: Array<[number, number, number]> = [];
  for (let i = 0; i < n[0]; i++) {
    for (let j = 0; j < n[1]; j++) {
      for (let k = 0; k < n[2]; k++) {
        const [x0, y0, z0] = [i * cx, j * cy, k * cz];
        const taken = placements.some(
          (p) => overlaps(x0, x0 + cx, p.x, p.dx) && overlaps(y0, y0 + cy, p.y, p.dy) && overlaps(z0, z0 + cz, p.z, p.dz),
        );
        if (!taken) positions.push([x0 + cx / 2 - L / 2, z0 + cz / 2, y0 + cy / 2 - W / 2]);
      }
    }
  }
  return { radius: Math.min(cx, cy, cz) * 0.48, positions };
}

/**
 * How full the carton is: the share of its inside the placed boxes take (sizes with padding and
 * margin, as packed) and the space left for filler, in litres.
 */
export function cartonFill(inner: readonly [number, number, number], placements: BoxPlacement[]): { usedShare: number; freeLitres: number } {
  const total = inner[0] * inner[1] * inner[2];
  const used = placements.reduce((s, p) => s + p.dx * p.dy * p.dz, 0);
  return { usedShare: Math.min(1, used / total), freeLitres: Math.max(0, total - used) / 1000 };
}

/**
 * The 3D view's steps for `n` items: 0 = empty carton, 1..n = items placed, n + 1 = gaps filled,
 * n + 2 = carton closed. The written steps run in the same order from 1, so view step v is written
 * step v + 1. Without a "this side up" step the written list has no step of its own for closing,
 * so the closed view shares the fill step's number.
 */
export function writtenStepOf(view: number, writtenCount: number): number {
  return Math.min(view + 1, writtenCount);
}

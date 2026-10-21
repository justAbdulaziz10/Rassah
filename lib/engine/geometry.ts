// Geometry helpers used by the packer (NOT by the validator, which keeps its own copies).

import type { Placement, Unit } from "./types";

export type Dims = [number, number, number];

/** Sort dimensions descending: L >= W >= H. */
export function sortDesc(d: readonly number[]): Dims {
  const s = [...d].sort((a, b) => b - a);
  return [s[0], s[1], s[2]];
}

/**
 * Allowed orientations (dx, dy, dz) of a unit.
 * Normal items: all 6 axis permutations, deduplicated when sides are equal.
 * Liquids: only the 2 orientations that keep the upright height vertical ("this side up").
 */
export function rotations(unit: Unit): Dims[] {
  const [a, b, c] = unit.dims;
  let candidates: Dims[];
  if (unit.liquid && unit.uprightHeight !== null) {
    const h = unit.uprightHeight;
    const rest = removeOnce(unit.dims, h);
    candidates = [
      [rest[0], rest[1], h],
      [rest[1], rest[0], h],
    ];
  } else {
    candidates = [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ];
  }
  const seen = new Set<string>();
  return candidates.filter((d) => {
    const key = d.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeOnce(dims: readonly number[], value: number): [number, number] {
  const copy = [...dims];
  let idx = copy.findIndex((d) => d === value);
  if (idx === -1) {
    // uprightHeight should equal one of the dims; fall back to the closest one.
    idx = copy.reduce((best, d, i) => (Math.abs(d - value) < Math.abs(copy[best] - value) ? i : best), 0);
  }
  copy.splice(idx, 1);
  return [copy[0], copy[1]];
}

function intervalOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function boxesOverlap(a: Placement, b: Placement, eps: number): boolean {
  return (
    intervalOverlap(a.x, a.x + a.dx, b.x, b.x + b.dx) > eps &&
    intervalOverlap(a.y, a.y + a.dy, b.y, b.y + b.dy) > eps &&
    intervalOverlap(a.z, a.z + a.dz, b.z, b.z + b.dz) > eps
  );
}

/** Area where the base of `top` touches the top face of `below` (0 if not directly on it). */
export function contactArea(top: Placement, below: Placement, eps: number): number {
  if (Math.abs(below.z + below.dz - top.z) > eps) return 0;
  return (
    intervalOverlap(top.x, top.x + top.dx, below.x, below.x + below.dx) *
    intervalOverlap(top.y, top.y + top.dy, below.y, below.y + below.dy)
  );
}

export function volume(d: readonly number[]): number {
  return d[0] * d[1] * d[2];
}

// Naive baseline for EVALUATION ONLY: "what a simple tool would do".
// Volume-descending first-fit over extreme points, all 6 rotations, smallest carton first,
// and NO support, fragile, or liquid rules. Its layouts are run through the same validator
// to show which real-world rules a naive packer breaks. Never import this from app routes.

import { boxesOverlap, volume } from "./geometry";
import type { Carton, Placement, Unit } from "./types";

type Dims = [number, number, number];

function allRotations([a, b, c]: Dims): Dims[] {
  const list: Dims[] = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  const seen = new Set<string>();
  return list.filter((d) => (seen.has(d.join()) ? false : (seen.add(d.join()), true)));
}

export interface BaselineResult {
  carton: Carton;
  placements: Placement[];
}

export function baselinePack(units: Unit[], cartons: Carton[], eps = 1e-6): BaselineResult | null {
  const order = [...units].sort((a, b) => volume(b.dims) - volume(a.dims) || a.unitId.localeCompare(b.unitId));
  const byVolume = [...cartons].sort((a, b) => volume(a.inner) - volume(b.inner) || a.id.localeCompare(b.id));

  for (const carton of byVolume) {
    const [L, W, H] = carton.inner;
    const placed: Placement[] = [];
    const points: Dims[] = [[0, 0, 0]];
    let ok = true;
    for (const u of order) {
      let chosen: Placement | null = null;
      outer: for (const [x, y, z] of points) {
        for (const [dx, dy, dz] of allRotations(u.dims)) {
          if (x + dx > L + eps || y + dy > W + eps || z + dz > H + eps) continue;
          const cand = { unitId: u.unitId, x, y, z, dx, dy, dz };
          if (placed.some((p) => boxesOverlap(cand, p, eps))) continue;
          chosen = cand; // first fit, no scoring
          break outer;
        }
      }
      if (!chosen) {
        ok = false;
        break;
      }
      placed.push(chosen);
      points.push(
        [chosen.x + chosen.dx, chosen.y, chosen.z],
        [chosen.x, chosen.y + chosen.dy, chosen.z],
        [chosen.x, chosen.y, chosen.z + chosen.dz],
      );
    }
    if (ok) return { carton, placements: placed };
  }
  return null;
}

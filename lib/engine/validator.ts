// Independent layout validator.
//
// IMPORTANT: this file must not import from packer.ts or geometry.ts. It re-implements every
// check from the rule table in docs/stack/03 on purpose: if the packer and the validator shared
// helper code, a bug in that code would be invisible to both. A test enforces the import rule.

import type { Carton, Placement, Unit, ValidationResult, Violation } from "./types";

export interface ValidatorOptions {
  minSupport: number;
  eps: number;
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function footprintContact(a: Placement, b: Placement): number {
  return overlap1d(a.x, a.x + a.dx, b.x, b.x + b.dx) * overlap1d(a.y, a.y + a.dy, b.y, b.y + b.dy);
}

function sameMultiset(a: number[], b: number[], eps: number): boolean {
  const sa = [...a].sort((p, q) => p - q);
  const sb = [...b].sort((p, q) => p - q);
  return sa.length === sb.length && sa.every((v, i) => Math.abs(v - sb[i]) <= eps);
}

export function validateLayout(
  units: Unit[],
  carton: Carton,
  placements: Placement[],
  opts: ValidatorOptions,
): ValidationResult {
  const { eps, minSupport } = opts;
  const violations: Violation[] = [];
  const unitsById = new Map(units.map((u) => [u.unitId, u]));
  const [L, W, H] = carton.inner;

  // R7 completeness: every requested unit placed exactly once, nothing extra.
  const seen = new Map<string, number>();
  for (const p of placements) seen.set(p.unitId, (seen.get(p.unitId) ?? 0) + 1);
  for (const u of units) {
    if (!seen.has(u.unitId)) {
      violations.push({ code: "missing_item", unitId: u.unitId, detail: "unit was not placed" });
    }
  }
  for (const [unitId, count] of seen) {
    if (!unitsById.has(unitId)) {
      violations.push({ code: "duplicate_item", unitId, detail: "placement for a unit that is not in the order" });
    } else if (count > 1) {
      violations.push({ code: "duplicate_item", unitId, detail: `unit placed ${count} times` });
    }
  }

  // Per-placement checks.
  for (const p of placements) {
    const u = unitsById.get(p.unitId);
    if (!u) continue;

    // Placed size must be a rotation of the unit's effective size.
    if (!sameMultiset([p.dx, p.dy, p.dz], u.dims, eps)) {
      violations.push({
        code: "dim_mismatch",
        unitId: p.unitId,
        detail: `placed ${p.dx}x${p.dy}x${p.dz}, expected a rotation of ${u.dims.join("x")}`,
      });
    }

    // R6 liquids keep their upright height vertical.
    if (u.liquid && u.uprightHeight !== null && Math.abs(p.dz - u.uprightHeight) > eps) {
      violations.push({
        code: "liquid_tipped",
        unitId: p.unitId,
        detail: `vertical size ${p.dz} but upright height is ${u.uprightHeight}`,
      });
    }

    // R1 inside the carton's INNER dimensions.
    const inside =
      p.x >= -eps && p.y >= -eps && p.z >= -eps &&
      p.x + p.dx <= L + eps && p.y + p.dy <= W + eps && p.z + p.dz <= H + eps;
    if (!inside) {
      violations.push({ code: "out_of_bounds", unitId: p.unitId, detail: "extends outside the carton" });
    }
  }

  // R2 no overlap: two boxes overlap only if their intervals overlap on all three axes.
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const ox = overlap1d(a.x, a.x + a.dx, b.x, b.x + b.dx);
      const oy = overlap1d(a.y, a.y + a.dy, b.y, b.y + b.dy);
      const oz = overlap1d(a.z, a.z + a.dz, b.z, b.z + b.dz);
      if (ox > eps && oy > eps && oz > eps) {
        violations.push({ code: "overlap", unitId: a.unitId, detail: `overlaps ${b.unitId}` });
      }
    }
  }

  // R3 weight: units + empty carton must not exceed the carton's limit.
  const totalG = units.reduce((s, u) => s + u.weightG, 0) + carton.tareG;
  if (totalG > carton.maxWeightG + eps) {
    violations.push({
      code: "overweight",
      unitId: null,
      detail: `${totalG} g exceeds the carton limit of ${carton.maxWeightG} g`,
    });
  }

  // R4 support (gravity) and R5 nothing resting on a fragile item.
  for (const a of placements) {
    if (a.z <= eps) continue; // on the carton floor
    let supported = 0;
    for (const b of placements) {
      if (b === a) continue;
      if (Math.abs(b.z + b.dz - a.z) > eps) continue; // b's top face is not directly under a
      const contact = footprintContact(a, b);
      if (contact <= eps) continue;
      supported += contact;
      if (unitsById.get(b.unitId)?.fragile) {
        violations.push({ code: "on_fragile", unitId: a.unitId, detail: `rests on fragile ${b.unitId}` });
      }
    }
    const ratio = supported / (a.dx * a.dy);
    if (ratio + eps < minSupport) {
      violations.push({
        code: "floating",
        unitId: a.unitId,
        detail: `only ${(ratio * 100).toFixed(0)}% of the base is supported (minimum ${(minSupport * 100).toFixed(0)}%)`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

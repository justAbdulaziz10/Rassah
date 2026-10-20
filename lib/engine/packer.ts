// Search-based packing: extreme-point placement with gravity and handling rules,
// tried under several item orderings for every carton. Deterministic for a given input
// (the only non-deterministic input is the wall-clock search budget).

import type { EngineConfig } from "./config";
import { estimateCost } from "./cost";
import { boxesOverlap, contactArea, rotations, volume } from "./geometry";
import type {
  Carton,
  CartonAttempt,
  PackNoBox,
  PackSuccess,
  Placement,
  ShippingRates,
  Unit,
  Violation,
} from "./types";
import { validateLayout } from "./validator";

export interface PackOptions {
  config: EngineConfig;
  rates: ShippingRates;
  /** Injectable clock for tests. Defaults to performance.now(). */
  now?: () => number;
}

interface Strategy {
  name: string;
  key: (u: Unit) => number;
}

// Each strategy is an item ordering. Fragile units always go last so they end up on top,
// which is what lets the "nothing rests on a fragile item" rule be satisfied.
export const STRATEGIES: Strategy[] = [
  { name: "volume", key: (u) => volume(u.dims) },
  { name: "base_area", key: (u) => u.dims[0] * u.dims[1] },
  { name: "weight", key: (u) => u.weightG }, // heavy items at the bottom
  { name: "longest_side", key: (u) => u.dims[0] },
];

export function orderUnits(units: Unit[], strategy: Strategy): Unit[] {
  const byKey = (a: Unit, b: Unit) => strategy.key(b) - strategy.key(a) || a.unitId.localeCompare(b.unitId);
  const normal = units.filter((u) => !u.fragile).sort(byKey);
  const fragile = units.filter((u) => u.fragile).sort(byKey);
  return [...normal, ...fragile];
}

type Point = [number, number, number];

interface PlaceState {
  candidatesChecked: number;
  deadline: number;
  now: () => number;
}

type GreedyResult = { kind: "complete"; placements: Placement[] } | { kind: "incomplete" } | { kind: "timeout" };

function fitsInCarton(d: readonly number[], inner: readonly number[], eps: number): boolean {
  return d[0] <= inner[0] + eps && d[1] <= inner[1] + eps && d[2] <= inner[2] + eps;
}

function greedyPlace(order: Unit[], carton: Carton, cfg: EngineConfig, state: PlaceState): GreedyResult {
  const { eps, minSupport } = cfg;
  const [L, W, H] = carton.inner;
  const placed: Placement[] = [];
  const placedUnits: Unit[] = [];
  let points: Point[] = [[0, 0, 0]];

  for (const unit of order) {
    if (state.now() > state.deadline) return { kind: "timeout" };
    let best: Placement | null = null;

    for (const [x, y, z] of points) {
      for (const [dx, dy, dz] of rotations(unit)) {
        state.candidatesChecked++;
        // R1 in bounds
        if (x + dx > L + eps || y + dy > W + eps || z + dz > H + eps) continue;
        const cand: Placement = { unitId: unit.unitId, x, y, z, dx, dy, dz };
        // R2 no overlap
        if (placed.some((p) => boxesOverlap(cand, p, eps))) continue;
        // R4 support and R5 nothing on fragile
        if (z > eps) {
          let support = 0;
          let onFragile = false;
          for (let i = 0; i < placed.length; i++) {
            const area = contactArea(cand, placed[i], eps);
            if (area <= eps) continue;
            support += area;
            if (placedUnits[i].fragile) onFragile = true;
          }
          if (onFragile || support + eps < minSupport * dx * dy) continue;
        }
        // Lowest first (gravity), then back, then left.
        if (
          !best ||
          z < best.z - eps ||
          (Math.abs(z - best.z) <= eps && (y < best.y - eps || (Math.abs(y - best.y) <= eps && x < best.x - eps)))
        ) {
          best = cand;
        }
      }
    }

    if (!best) return { kind: "incomplete" };
    placed.push(best);
    placedUnits.push(unit);

    const { x, y, z, dx, dy, dz } = best;
    const next: Point[] = [
      [x + dx, y, z],
      [x, y + dy, z],
      [x, y, z + dz],
      [x + dx, 0, z],
      [0, y + dy, z],
    ];
    const keyOf = (p: Point) => p.map((v) => v.toFixed(4)).join(",");
    const seen = new Set(points.map(keyOf));
    for (const p of next) {
      if (p[0] >= L - eps || p[1] >= W - eps || p[2] >= H - eps) continue;
      const k = keyOf(p);
      if (!seen.has(k)) {
        seen.add(k);
        points.push(p);
      }
    }
    // Drop points that now sit inside a placed box.
    points = points.filter(
      ([px, py, pz]) =>
        !placed.some(
          (b) =>
            px > b.x + eps && px < b.x + b.dx - eps &&
            py > b.y + eps && py < b.y + b.dy - eps &&
            pz > b.z + eps && pz < b.z + b.dz - eps,
        ),
    );
  }
  return { kind: "complete", placements: placed };
}

export function packUnits(units: Unit[], cartons: Carton[], opts: PackOptions): PackSuccess | PackNoBox {
  const cfg = opts.config;
  const now = opts.now ?? (() => performance.now());
  const start = now();
  const state: PlaceState = { candidatesChecked: 0, deadline: start + cfg.maxSearchMs, now };
  const attempts: CartonAttempt[] = [];
  const violations: Array<Violation & { cartonId: string }> = [];
  let validatorRejections = 0;
  let timedOut = false;
  const found: Array<{ carton: Carton; placements: Placement[]; strategy: string }> = [];

  const unitsWeight = units.reduce((s, u) => s + u.weightG, 0);
  const ordered = [...cartons].sort(
    (a, b) => a.costSar - b.costSar || volume(a.inner) - volume(b.inner) || a.id.localeCompare(b.id),
  );

  for (const carton of ordered) {
    if (timedOut) {
      attempts.push({ cartonId: carton.id, outcome: "search_budget", strategy: null });
      continue;
    }
    // Cheap pre-checks before searching.
    if (units.some((u) => !rotations(u).some((d) => fitsInCarton(d, carton.inner, cfg.eps)))) {
      attempts.push({ cartonId: carton.id, outcome: "oversize", strategy: null });
      continue;
    }
    if (unitsWeight + carton.tareG > carton.maxWeightG + cfg.eps) {
      attempts.push({ cartonId: carton.id, outcome: "overweight", strategy: null });
      continue;
    }

    let packedWith: string | null = null;
    let rejectedHere = false;
    for (const strategy of STRATEGIES) {
      const result = greedyPlace(orderUnits(units, strategy), carton, cfg, state);
      if (result.kind === "timeout") {
        timedOut = true;
        break;
      }
      if (result.kind === "incomplete") continue;
      // Every layout passes through the independent validator before it can be shown.
      const check = validateLayout(units, carton, result.placements, { minSupport: cfg.minSupport, eps: cfg.eps });
      if (!check.valid) {
        validatorRejections++;
        rejectedHere = true;
        for (const v of check.violations) violations.push({ ...v, cartonId: carton.id });
        continue;
      }
      found.push({ carton, placements: result.placements, strategy: strategy.name });
      packedWith = strategy.name;
      break;
    }

    if (packedWith) attempts.push({ cartonId: carton.id, outcome: "packed", strategy: packedWith });
    else if (timedOut) attempts.push({ cartonId: carton.id, outcome: "search_budget", strategy: null });
    else attempts.push({ cartonId: carton.id, outcome: rejectedHere ? "validator_rejected" : "no_layout", strategy: null });
  }

  const searchMs = Math.round(now() - start);
  const common = { attempts, candidatesChecked: state.candidatesChecked, validatorRejections, violations, searchMs };

  if (found.length === 0) {
    return {
      status: "no_box",
      reason: "No valid carton found within the search budget",
      ...common,
    };
  }

  // Cheapest estimated total (carton + shipping); ties go to the smaller carton.
  const scored = found.map((f) => ({ ...f, cost: estimateCost(f.carton, units, opts.rates, cfg.wallCm) }));
  scored.sort(
    (a, b) => a.cost.totalSar - b.cost.totalSar || volume(a.carton.inner) - volume(b.carton.inner),
  );
  const best = scored[0];
  return {
    status: "box_found",
    carton: best.carton,
    placements: best.placements,
    units,
    strategy: best.strategy,
    cost: best.cost,
    ...common,
  };
}

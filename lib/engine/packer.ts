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

/**
 * How to choose among valid positions for the next unit:
 * - "lowest_top": minimise the resulting top surface (z + dz), keeping flat, even layers.
 *   This stops tall/standing placements that waste space (e.g. a book stood on its edge).
 * - "lowest_base": classic gravity-first (minimise z), then back, then left.
 */
type ScoreMode = "lowest_top" | "lowest_base" | "tight_x" | "tight_y";

interface Strategy {
  name: string;
  key: (u: Unit) => number;
  /** true: fragile units are placed after all others so they end up on top. */
  fragileLast: boolean;
  score: ScoreMode;
}

const byVolume = (u: Unit) => volume(u.dims);
const byBaseArea = (u: Unit) => u.dims[0] * u.dims[1];

// Tried in order for every carton; the first strategy that yields a validated layout wins.
// The "nothing on a fragile item" rule is enforced by the placement check in every strategy;
// fragileLast only changes the order, which usually (not always) makes that rule easy to meet.
export const STRATEGIES: Strategy[] = [
  { name: "volume", key: byVolume, fragileLast: true, score: "lowest_top" },
  { name: "base_area", key: byBaseArea, fragileLast: true, score: "lowest_top" },
  { name: "weight", key: (u) => u.weightG, fragileLast: true, score: "lowest_top" }, // heavy at the bottom
  { name: "longest_side", key: (u) => u.dims[0], fragileLast: true, score: "lowest_top" },
  { name: "volume_base_first", key: byVolume, fragileLast: true, score: "lowest_base" },
  { name: "volume_fragile_anywhere", key: byVolume, fragileLast: false, score: "lowest_top" },
  { name: "base_area_fragile_anywhere", key: byBaseArea, fragileLast: false, score: "lowest_base" },
  { name: "volume_tight_x", key: byVolume, fragileLast: true, score: "tight_x" },
  { name: "volume_tight_y", key: byVolume, fragileLast: true, score: "tight_y" },
];

const RESTART_SCORES: ScoreMode[] = ["lowest_top", "tight_x", "lowest_base", "tight_y"];

export function orderUnits(units: Unit[], strategy: Strategy): Unit[] {
  const byKey = (a: Unit, b: Unit) => strategy.key(b) - strategy.key(a) || a.unitId.localeCompare(b.unitId);
  if (!strategy.fragileLast) return [...units].sort(byKey);
  const normal = units.filter((u) => !u.fragile).sort(byKey);
  const fragile = units.filter((u) => u.fragile).sort(byKey);
  return [...normal, ...fragile];
}

/**
 * Lexicographic score; smaller is better.
 * - tight_x / tight_y: gravity first, then the smallest far edge along x (or y). This prefers
 *   standing a thin item on its side to fill a strip exactly, which flat-first scores never do
 *   (found on fixture feasible-05: a 3.4 cm strip that only fits a standing item).
 */
function scoreOf(p: Placement, mode: ScoreMode): [number, number, number, number] {
  switch (mode) {
    case "lowest_top":
      return [p.z + p.dz, p.z, p.y, p.x];
    case "lowest_base":
      return [p.z, p.y, p.x, p.z + p.dz];
    case "tight_x":
      return [p.z, p.x + p.dx, p.y + p.dy, p.z + p.dz];
    case "tight_y":
      return [p.z, p.y + p.dy, p.x + p.dx, p.z + p.dz];
  }
}

function better(a: [number, number, number, number], b: [number, number, number, number], eps: number): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - eps) return true;
    if (a[i] > b[i] + eps) return false;
  }
  return false;
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

function greedyPlace(
  order: Unit[],
  carton: Carton,
  cfg: EngineConfig,
  state: PlaceState,
  mode: ScoreMode,
): GreedyResult {
  const { eps, minSupport } = cfg;
  const [L, W, H] = carton.inner;
  const placed: Placement[] = [];
  const placedUnits: Unit[] = [];

  for (const unit of order) {
    if (state.now() > state.deadline) return { kind: "timeout" };
    let best: Placement | null = null;
    let bestScore: [number, number, number, number] | null = null;

    for (const [x, y, z] of cornerGrid(placed, carton, eps)) {
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
        const s = scoreOf(cand, mode);
        if (!bestScore || better(s, bestScore, eps)) {
          best = cand;
          bestScore = s;
        }
      }
    }

    if (!best) return { kind: "incomplete" };
    placed.push(best);
    placedUnits.push(unit);
  }
  return { kind: "complete", placements: placed };
}

/**
 * Candidate positions: every combination of x ∈ {0, right edges}, y ∈ {0, back edges},
 * z ∈ {0, top faces} of the boxes placed so far. This "corner grid" contains all classic
 * extreme points, plus the projected positions that tight packings need. The checks in
 * greedyPlace reject the ones that overlap or float.
 */
function cornerGrid(placed: Placement[], carton: Carton, eps: number): Point[] {
  const [L, W, H] = carton.inner;
  const uniq = (vals: number[], limit: number) => {
    const out: number[] = [];
    for (const v of vals.sort((a, b) => a - b)) {
      if (v >= limit - eps) continue;
      if (out.length === 0 || v - out[out.length - 1] > eps) out.push(v);
    }
    return out;
  };
  const xs = uniq([0, ...placed.map((b) => b.x + b.dx)], L);
  const ys = uniq([0, ...placed.map((b) => b.y + b.dy)], W);
  const zs = uniq([0, ...placed.map((b) => b.z + b.dz)], H);
  const points: Point[] = [];
  for (const z of zs) for (const y of ys) for (const x of xs) points.push([x, y, z]);
  return points;
}

/** Small deterministic PRNG (mulberry32), so restarts are reproducible for the same order. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Seeded random orderings tried after the fixed strategies fail (deterministic per order + carton). */
function restartOrders(units: Unit[], cartonId: string, count: number): Array<{ name: string; order: Unit[]; score: ScoreMode }> {
  const rand = prng(seedOf(units.map((u) => u.unitId).join("|") + "@" + cartonId));
  const out: Array<{ name: string; order: Unit[]; score: ScoreMode }> = [];
  for (let k = 0; k < count; k++) {
    const shuffled = [...units].sort((a, b) => a.unitId.localeCompare(b.unitId));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Alternate fragile-last and fragile-anywhere, and both position scores.
    const fragileLast = k % 2 === 0;
    const order = fragileLast ? [...shuffled.filter((u) => !u.fragile), ...shuffled.filter((u) => u.fragile)] : shuffled;
    out.push({ name: `restart_${k + 1}`, order, score: RESTART_SCORES[Math.floor(k / 2) % RESTART_SCORES.length] });
  }
  return out;
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
    // Fixed strategies first, then seeded restarts. Restarts for this carton stop at its fair
    // share of the remaining budget, so larger cartons later in the list still get searched.
    const cartonsLeft = ordered.length - ordered.indexOf(carton);
    const cartonSoftDeadline = now() + (state.deadline - now()) / cartonsLeft;
    const tries = [
      ...STRATEGIES.map((s) => ({ name: s.name, order: orderUnits(units, s), score: s.score, restart: false })),
      ...restartOrders(units, carton.id, cfg.restarts).map((r) => ({ ...r, restart: true })),
    ];
    for (const strategy of tries) {
      if (strategy.restart && now() > cartonSoftDeadline) break;
      const result = greedyPlace(strategy.order, carton, cfg, state, strategy.score);
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

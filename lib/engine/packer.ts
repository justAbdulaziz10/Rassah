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

/**
 * Placement check shared by both searches: R1 in bounds, R2 no overlap, R4 support and
 * R5 nothing on a fragile item. R6 (liquid upright) is guaranteed by rotations(). The
 * independent validator re-checks all of these on every finished layout.
 */
function canPlace(
  cand: Placement,
  placed: Placement[],
  placedUnits: Unit[],
  carton: Carton,
  cfg: EngineConfig,
  voids: readonly Placement[] = [],
): boolean {
  const { eps, minSupport } = cfg;
  const [L, W, H] = carton.inner;
  if (cand.x + cand.dx > L + eps || cand.y + cand.dy > W + eps || cand.z + cand.dz > H + eps) return false;
  for (const p of placed) if (boxesOverlap(cand, p, eps)) return false;
  // Space the anchor search has declared empty for good. Blocks items, never supports them.
  for (const v of voids) if (boxesOverlap(cand, v, eps)) return false;
  if (cand.z > eps) {
    let support = 0;
    for (let i = 0; i < placed.length; i++) {
      const area = contactArea(cand, placed[i], eps);
      if (area <= eps) continue;
      if (placedUnits[i].fragile) return false;
      support += area;
    }
    if (support + eps < minSupport * cand.dx * cand.dy) return false;
  }
  return true;
}

function greedyPlace(
  order: Unit[],
  carton: Carton,
  cfg: EngineConfig,
  state: PlaceState,
  mode: ScoreMode,
): GreedyResult {
  const { eps } = cfg;
  const placed: Placement[] = [];
  const placedUnits: Unit[] = [];

  for (const unit of order) {
    if (state.now() > state.deadline) return { kind: "timeout" };
    let best: Placement | null = null;
    let bestScore: [number, number, number, number] | null = null;

    for (const [x, y, z] of cornerGrid(placed, carton, eps)) {
      for (const [dx, dy, dz] of rotations(unit)) {
        state.candidatesChecked++;
        const cand: Placement = { unitId: unit.unitId, x, y, z, dx, dy, dz };
        if (!canPlace(cand, placed, placedUnits, carton, cfg)) continue;
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
  const [xs, ys, zs] = gridAxes(placed, carton, eps);
  const points: Point[] = [];
  for (const z of zs) for (const y of ys) for (const x of xs) points.push([x, y, z]);
  return points;
}

/** Sorted, deduplicated grid coordinates on each axis (see cornerGrid). */
function gridAxes(placed: Placement[], carton: Carton, eps: number): [number[], number[], number[]] {
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
  return [xs, ys, zs];
}

/** Units that are interchangeable for every rule (weight only matters for the carton total). */
function shapeKey(u: Unit): string {
  return `${u.dims.join(",")}|${u.fragile ? 1 : 0}|${u.liquid ? u.uprightHeight : "-"}`;
}

/**
 * Anchor search (engine-0.2): a bounded depth-first search with backtracking.
 * At every step it takes the lowest uncovered corner (smallest z, then y, then x) and tries
 * every remaining unit in every allowed rotation there, undoing choices that lead to a dead end.
 *
 * Why: the greedy passes commit to one locally-best position per unit and never undo it. Exact
 * fills (zero slack) need a specific mix of flat and standing orientations, which a single score
 * rarely produces (found on fixtures feasible-03/06/07/09/20). For a zero-slack carton the search
 * is complete: in any gap-free packing, the box covering the lowest uncovered point has its
 * origin exactly there, so the witness packing is one of the branches. With slack, the search can
 * also leave the current corner empty ("skip") and try the next one.
 *
 * Bounded by `nodeLimit` (deterministic) and by the wall-clock deadline (safety). Identical units
 * are tried once per corner, so repeated items do not multiply the search.
 */
function anchorSearch(
  units: Unit[],
  carton: Carton,
  cfg: EngineConfig,
  state: PlaceState,
  nodeLimit: number,
  softDeadline: number,
  stats?: { nodes: number },
): GreedyResult {
  const { eps } = cfg;
  const n = units.length;
  const order = [...units].sort((a, b) => volume(b.dims) - volume(a.dims) || a.unitId.localeCompare(b.unitId));
  const rots = order.map((u) => rotations(u).filter((d) => fitsInCarton(d, carton.inner, eps)));
  const [L, W, H] = carton.inner;
  const slack = volume(carton.inner) - order.reduce((s, u) => s + volume(u.dims), 0);
  const tolerance = 1e-6 * volume(carton.inner);
  const used = new Array<boolean>(n).fill(false);
  const placed: Placement[] = [];
  const placedUnits: Unit[] = [];
  const voids: Placement[] = []; // empty space declared wasted; its total may not exceed the slack
  let waste = 0;
  let nodes = 0;
  let stop: "limit" | "timeout" | null = null;

  // Walk the corner grid with z outermost, then y, then x, all ascending, so the first
  // uncovered point is the lexicographic minimum. A point is covered when it lies inside a
  // placed box or a void (half-open: a box's far faces belong to the free space beyond it).
  // Within a row, a covering box lets the walk jump straight to that box's right edge.
  const anchor = (): Point | null => {
    const obstacles = voids.length ? [...placed, ...voids] : placed;
    const [xs, ys, zs] = gridAxes(obstacles, carton, eps);
    for (const z of zs) {
      const layer = obstacles.filter((b) => z >= b.z - eps && z < b.z + b.dz - eps);
      for (const y of ys) {
        const row = layer.filter((b) => y >= b.y - eps && y < b.y + b.dy - eps);
        let i = 0;
        while (i < xs.length) {
          const x = xs[i];
          const cover = row.find((b) => x >= b.x - eps && x < b.x + b.dx - eps);
          if (!cover) return [x, y, z];
          const end = cover.x + cover.dx - eps;
          while (i < xs.length && xs[i] < end) i++;
        }
      }
    }
    return null;
  };

  /**
   * The empty cuboid that starts at anchor p: as far as the nearest obstacle along +x, then
   * along +y over that strip, and up to the next height level (thin, so little is wasted).
   * Because p is the lowest uncovered corner, no box overlaps this cuboid.
   */
  const voidAt = ([x, y, z]: Point, minSide: number): Placement => {
    const obstacles = voids.length ? [...placed, ...voids] : placed;
    const spans = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - eps && b0 < a1 - eps;
    let x1 = L;
    for (const b of obstacles) {
      if (b.x >= x + eps && b.x < x1 && spans(y, y + eps, b.y, b.y + b.dy) && spans(z, z + eps, b.z, b.z + b.dz)) x1 = b.x;
    }
    let y1 = W;
    for (const b of obstacles) {
      if (b.y >= y + eps && b.y < y1 && spans(x, x1, b.x, b.x + b.dx) && spans(z, z + eps, b.z, b.z + b.dz)) y1 = b.y;
    }
    let z1 = Math.min(H, z + minSide);
    for (const b of obstacles) {
      const top = b.z + b.dz;
      if (top > z + eps && top < z1) z1 = top;
      if (b.z > z + eps && b.z < z1 && spans(x, x1, b.x, b.x + b.dx) && spans(y, y1, b.y, b.y + b.dy)) z1 = b.z;
    }
    return { unitId: "", x, y, z, dx: x1 - x, dy: y1 - y, dz: z1 - z };
  };

  const dfs = (depth: number): boolean => {
    if (depth === n) return true;
    if (++nodes > nodeLimit) {
      stop = "limit";
      return false;
    }
    if ((nodes & 63) === 0) {
      const t = state.now();
      if (t > state.deadline || t > softDeadline) {
        stop = "timeout";
        return false;
      }
    }
    const p = anchor();
    if (!p) return false;
    const [x, y, z] = p;
    const tried = new Set<string>();
    let minSide = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const u = order[i];
      minSide = Math.min(minSide, u.dims[2]);
      const key = shapeKey(u);
      if (tried.has(key)) continue;
      tried.add(key);
      for (const [dx, dy, dz] of rots[i]) {
        state.candidatesChecked++;
        const cand: Placement = { unitId: u.unitId, x, y, z, dx, dy, dz };
        if (!canPlace(cand, placed, placedUnits, carton, cfg, voids)) continue;
        used[i] = true;
        placed.push(cand);
        placedUnits.push(u);
        if (dfs(depth + 1)) return true;
        used[i] = false;
        placed.pop();
        placedUnits.pop();
        if (stop) return false;
      }
    }
    // Leave this corner empty: declare the gap there wasted, as long as the total waste still
    // fits in the carton's slack (free volume). With zero slack this branch never runs.
    const gap = voidAt(p, minSide);
    const gapVolume = gap.dx * gap.dy * gap.dz;
    if (gapVolume > eps && waste + gapVolume <= slack + tolerance) {
      voids.push(gap);
      waste += gapVolume;
      if (dfs(depth)) return true;
      voids.pop();
      waste -= gapVolume;
    }
    return false;
  };

  const ok = dfs(0);
  if (stats) stats.nodes = nodes;
  if (ok) return { kind: "complete", placements: placed };
  // Only the global deadline counts as a search-budget stop; a per-carton limit is "not found here".
  if (stop === "timeout" && state.now() > state.deadline) return { kind: "timeout" };
  return { kind: "incomplete" };
}

/**
 * The anchor search on its own, for tests and diagnosis: no greedy passes, no time budget,
 * no validator. Callers must validate the placements themselves.
 */
export function anchorPack(
  units: Unit[],
  carton: Carton,
  cfg: EngineConfig,
  nodeLimit = cfg.anchorNodes,
): { placements: Placement[] | null; nodes: number } {
  const state: PlaceState = { candidatesChecked: 0, deadline: Infinity, now: () => 0 };
  const stats = { nodes: 0 };
  const r = anchorSearch(units, carton, cfg, state, nodeLimit, Infinity, stats);
  return { placements: r.kind === "complete" ? r.placements : null, nodes: stats.nodes };
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
  const unitsVolume = units.reduce((s, u) => s + volume(u.dims), 0);
  const ordered = [...cartons].sort(
    (a, b) => a.costSar - b.costSar || volume(a.inner) - volume(b.inner) || a.id.localeCompare(b.id),
  );

  type Try = { name: string; extra: boolean; run: (softDeadline: number) => GreedyResult };
  const rejected = new Set<string>();

  /** Runs tries in order until one yields a layout that passes the independent validator. */
  const runTries = (carton: Carton, tries: Try[], softDeadline: number): string | null => {
    for (const t of tries) {
      if (t.extra && now() > softDeadline) break;
      const result = t.run(softDeadline);
      if (result.kind === "timeout") {
        timedOut = true;
        return null;
      }
      if (result.kind === "incomplete") continue;
      // Every layout passes through the independent validator before it can be shown.
      const check = validateLayout(units, carton, result.placements, { minSupport: cfg.minSupport, eps: cfg.eps });
      if (!check.valid) {
        validatorRejections++;
        rejected.add(carton.id);
        for (const v of check.violations) violations.push({ ...v, cartonId: carton.id });
        continue;
      }
      found.push({ carton, placements: result.placements, strategy: t.name });
      return t.name;
    }
    return null;
  };

  // A carton's estimated total cost depends only on the carton and the units, so it is known
  // before searching. Used to skip deep searches that could not improve the final choice.
  const costOf = new Map(ordered.map((c) => [c.id, estimateCost(c, units, opts.rates, cfg.wallCm).totalSar]));
  const beats = (a: Carton, b: Carton) =>
    costOf.get(a.id)! < costOf.get(b.id)! ||
    (costOf.get(a.id) === costOf.get(b.id) && volume(a.inner) < volume(b.inner));

  // Phase 1: fast greedy passes (fixed strategies, then seeded restarts) on every carton.
  const outcome = new Map<string, CartonAttempt>();
  const searchable: Carton[] = [];
  for (const carton of ordered) {
    if (timedOut) {
      outcome.set(carton.id, { cartonId: carton.id, outcome: "search_budget", strategy: null });
      continue;
    }
    // Cheap pre-checks before searching.
    if (units.some((u) => !rotations(u).some((d) => fitsInCarton(d, carton.inner, cfg.eps)))) {
      outcome.set(carton.id, { cartonId: carton.id, outcome: "oversize", strategy: null });
      continue;
    }
    if (unitsWeight + carton.tareG > carton.maxWeightG + cfg.eps) {
      outcome.set(carton.id, { cartonId: carton.id, outcome: "overweight", strategy: null });
      continue;
    }
    // Units larger in total than the carton can never fit: no search needed.
    if (unitsVolume > volume(carton.inner) + cfg.eps) {
      outcome.set(carton.id, { cartonId: carton.id, outcome: "no_layout", strategy: null });
      continue;
    }

    // Restarts for this carton stop at its fair share of the remaining budget, so larger
    // cartons later in the list still get searched.
    const cartonsLeft = ordered.length - ordered.indexOf(carton);
    const softDeadline = now() + (state.deadline - now()) / cartonsLeft;
    const tries: Try[] = [
      ...STRATEGIES.map((s) => {
        const order = orderUnits(units, s);
        return { name: s.name, extra: false, run: () => greedyPlace(order, carton, cfg, state, s.score) };
      }),
      ...restartOrders(units, carton.id, cfg.restarts).map((r) => ({
        name: r.name,
        extra: true,
        run: () => greedyPlace(r.order, carton, cfg, state, r.score),
      })),
    ];
    const packedWith = runTries(carton, tries, softDeadline);
    if (packedWith) outcome.set(carton.id, { cartonId: carton.id, outcome: "packed", strategy: packedWith });
    else if (timedOut) outcome.set(carton.id, { cartonId: carton.id, outcome: "search_budget", strategy: null });
    else searchable.push(carton);
  }

  // Phase 2: backtracking anchor search, only on cartons that would beat every carton already
  // packed (cheaper estimated total, or equal and smaller). Searching the others could not
  // change the answer, so they keep their phase-1 outcome. Cheapest first, so after a success
  // the remaining (more expensive) cartons are skipped.
  searchable.sort((a, b) => (beats(a, b) ? -1 : beats(b, a) ? 1 : a.id.localeCompare(b.id)));
  for (const carton of searchable) {
    if (timedOut) {
      outcome.set(carton.id, { cartonId: carton.id, outcome: "search_budget", strategy: null });
      continue;
    }
    const worthIt = found.every((f) => beats(carton, f.carton));
    let packedWith: string | null = null;
    if (worthIt) {
      const left = searchable.length - searchable.indexOf(carton);
      const softDeadline = now() + (state.deadline - now()) / left;
      packedWith = runTries(
        carton,
        [{ name: "anchor_search", extra: true, run: (d) => anchorSearch(units, carton, cfg, state, cfg.anchorNodes, d) }],
        softDeadline,
      );
    }
    if (packedWith) outcome.set(carton.id, { cartonId: carton.id, outcome: "packed", strategy: packedWith });
    else if (timedOut) outcome.set(carton.id, { cartonId: carton.id, outcome: "search_budget", strategy: null });
    else {
      const code = rejected.has(carton.id) ? "validator_rejected" : "no_layout";
      outcome.set(carton.id, { cartonId: carton.id, outcome: code, strategy: null });
    }
  }
  for (const carton of ordered) attempts.push(outcome.get(carton.id)!);

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

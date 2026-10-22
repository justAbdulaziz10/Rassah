// Multi-box split: used only when no single carton fits the whole order. Groups the units
// first-fit-decreasing, one box at a time, and asks packUnits for each group, so every box
// is a normal single-carton answer (searched, validated, priced). Two unit orderings are
// tried (largest first, heaviest first), each followed by a pass that tries to empty the
// last box into the others; the cheaper complete plan wins.

import { buildInstructions, type InstructionStep } from "./instructions";
import { packUnits, type PackOptions } from "./packer";
import type { Carton, PackSuccess, Unit } from "./types";
import { volume } from "./geometry";
import { round2 } from "../math";

/** One carton of the plan: a normal single-carton answer for its share of the units. */
export interface SplitBox extends PackSuccess {
  instructions: InstructionStep[];
}

export interface SplitPlan {
  boxes: SplitBox[];
  /** Sum of the boxes' estimated totals (carton + shipping each), SAR. */
  totalSar: number;
  searchMs: number;
}

/** Longest a single group check may search; groups are small, so this is rarely reached. */
const GROUP_BUDGET_MS = 300;

const totalOf = (boxes: PackSuccess[]) => boxes.reduce((s, b) => s + b.cost.totalSar, 0);

export function splitPack(units: Unit[], cartons: Carton[], opts: PackOptions & { maxBoxes?: number }): SplitPlan | null {
  const cfg = opts.config;
  const now = opts.now ?? (() => performance.now());
  const start = now();
  const deadline = start + cfg.maxSearchMs;
  const maxBoxes = opts.maxBoxes ?? 4;
  if (units.length < 2) return null;

  /** The best single carton for a group, null if none fits, "timeout" when the split budget is spent. */
  const tryGroup = (group: Unit[]): PackSuccess | null | "timeout" => {
    const left = deadline - now();
    if (left <= 0) return "timeout";
    const r = packUnits(group, cartons, { ...opts, config: { ...cfg, maxSearchMs: Math.min(GROUP_BUDGET_MS, left) } });
    return r.status === "box_found" ? r : null;
  };

  /** First-fit-decreasing, one box at a time. null when a unit fits no carton or time runs out. */
  const fill = (ordering: Unit[]): PackSuccess[] | null => {
    const remaining = [...ordering];
    const boxes: PackSuccess[] = [];
    while (remaining.length > 0) {
      const group = [remaining[0]];
      let packed = tryGroup(group);
      // A unit that fits no carton on its own cannot be shipped in any split.
      if (packed === null || packed === "timeout") return null;
      for (const u of remaining.slice(1)) {
        const trial = tryGroup([...group, u]);
        if (trial === "timeout") return null;
        if (trial) {
          group.push(u);
          packed = trial;
        }
      }
      boxes.push(packed);
      const taken = new Set(group.map((u) => u.unitId));
      for (let i = remaining.length - 1; i >= 0; i--) if (taken.has(remaining[i].unitId)) remaining.splice(i, 1);
      if (boxes.length > maxBoxes) return null;
    }
    return boxes;
  };

  /** Move the last box's units into earlier boxes where they fit; keep the result only if it is cheaper. */
  const emptyLast = (boxes: PackSuccess[]): PackSuccess[] => {
    if (boxes.length < 2) return boxes;
    const next = boxes.slice(0, -1);
    const left: Unit[] = [];
    for (const u of boxes[boxes.length - 1].units) {
      let placed = false;
      for (let i = 0; i < next.length && !placed; i++) {
        const trial = tryGroup([...next[i].units, u]);
        if (trial === "timeout") return boxes;
        if (trial) {
          next[i] = trial;
          placed = true;
        }
      }
      if (!placed) left.push(u);
    }
    if (left.length > 0) {
      const rest = tryGroup(left);
      if (!rest || rest === "timeout") return boxes;
      next.push(rest);
    }
    return totalOf(next) < totalOf(boxes) - 1e-9 ? next : boxes;
  };

  const orderings: Unit[][] = [
    [...units].sort((a, b) => volume(b.dims) - volume(a.dims) || b.weightG - a.weightG || a.unitId.localeCompare(b.unitId)),
    [...units].sort((a, b) => b.weightG - a.weightG || volume(b.dims) - volume(a.dims) || a.unitId.localeCompare(b.unitId)),
  ];

  let best: PackSuccess[] | null = null;
  for (const ordering of orderings) {
    const filled = fill(ordering);
    if (!filled) continue;
    const boxes = emptyLast(filled);
    const better =
      !best ||
      totalOf(boxes) < totalOf(best) - 1e-9 ||
      (Math.abs(totalOf(boxes) - totalOf(best)) < 1e-9 && boxes.length < best.length);
    if (better) best = boxes;
  }

  if (!best) return null;
  return {
    boxes: best.map((b) => ({ ...b, instructions: buildInstructions(b.carton, b.placements, b.units, cfg.paddingCm) })),
    totalSar: round2(totalOf(best)),
    searchMs: Math.round(now() - start),
  };
}

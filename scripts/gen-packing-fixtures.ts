// Generates data/packing_fixtures.json: 20 known-feasible, 20 impossible, 20 random fixtures.
// Deterministic (fixed seed): running it twice produces an identical file.
//
// Known-feasible fixtures are built by recursively cutting a carton into boxes (guillotine
// cuts), so a valid packing provably exists: the cuts themselves are the witness layout.
// Fragile and liquid flags are only assigned where the witness stays valid.

import fs from "node:fs";
import path from "node:path";
import { validateLayout } from "../lib/engine/validator";
import { ENGINE_CONFIG } from "../lib/engine/config";
import { loadCartons } from "../lib/data/load";
import type { Placement, Unit } from "../lib/engine/types";

const SEED = 20261022;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const r1 = (n: number) => Math.round(n * 10) / 10;
const sortDesc = (d: number[]) => [...d].sort((a, b) => b - a) as [number, number, number];

const { cartons } = loadCartons();
const allIds = cartons.map((c) => c.id);
const MIN_PIECE = 3;

interface Box { x: number; y: number; z: number; dx: number; dy: number; dz: number }

function guillotine(box: Box, pieces: number): Box[] {
  let boxes = [box];
  let guard = 0;
  while (boxes.length < pieces && guard++ < 200) {
    // Cut the largest box along an axis where both halves stay >= MIN_PIECE.
    boxes.sort((a, b) => b.dx * b.dy * b.dz - a.dx * a.dy * a.dz);
    const b = boxes[0];
    const axes = (["dx", "dy", "dz"] as const).filter((k) => b[k] >= 2 * MIN_PIECE);
    if (axes.length === 0) break;
    const axis = pick(axes);
    const cut = r1(MIN_PIECE + rand() * (b[axis] - 2 * MIN_PIECE));
    const first = { ...b, [axis]: cut };
    const offsetKey = axis === "dx" ? "x" : axis === "dy" ? "y" : "z";
    const second = { ...b, [axis]: r1(b[axis] - cut), [offsetKey]: r1(b[offsetKey] + cut) };
    boxes = [first, second, ...boxes.slice(1)];
  }
  return boxes;
}

function knownFeasible(i: number) {
  const carton = pick(cartons.filter((c) => c.id !== "XL"));
  const [L, W, H] = carton.inner;
  const boxes = guillotine({ x: 0, y: 0, z: 0, dx: L, dy: W, dz: H }, 3 + Math.floor(rand() * 5));
  const budget = carton.maxWeightG - carton.tareG;
  const units: Unit[] = [];
  const placements: Placement[] = [];
  boxes.forEach((b, k) => {
    const unitId = `f${i}-${k}#1`;
    const onTop = Math.abs(b.z + b.dz - H) < 1e-6; // nothing above it in the witness
    const fragile = onTop && rand() < 0.35;
    const liquid = rand() < 0.15; // upright height = its vertical size in the witness
    const dims = sortDesc([b.dx, b.dy, b.dz]);
    units.push({
      unitId, productId: `f${i}-${k}`, name: unitId, dims, baseDims: dims,
      weightG: Math.max(50, Math.round((budget / boxes.length) * (0.3 + rand() * 0.6))),
      fragile, liquid, sensitive: false, estimated: false, uprightHeight: liquid ? b.dz : null,
    });
    placements.push({ unitId, ...b });
  });
  const check = validateLayout(units, carton, placements, { minSupport: ENGINE_CONFIG.minSupport, eps: ENGINE_CONFIG.eps });
  if (!check.valid) throw new Error(`witness for f${i} is invalid: ${JSON.stringify(check.violations)}`);
  return {
    id: `feasible-${String(i + 1).padStart(2, "0")}`,
    group: "known_feasible" as const,
    cartonIds: [carton.id], // only the witness carton: recall measures tight packing, not "XL fits anything"
    units: units.map(toFixtureUnit),
    witness: { cartonId: carton.id, placements },
  };
}

function impossible(i: number) {
  const kind = (["oversize", "overweight", "liquid_too_tall"] as const)[i % 3];
  const units: Unit[] = [];
  const add = (dims: number[], weightG: number, liquid = false, upright: number | null = null) => {
    const unitId = `x${i}-${units.length}#1`;
    const sorted = sortDesc(dims);
    units.push({
      unitId, productId: unitId, name: unitId, dims: sorted, baseDims: sorted, weightG,
      fragile: false, liquid, sensitive: false, estimated: false, uprightHeight: upright,
    });
  };
  if (kind === "oversize") {
    add([55 + Math.floor(rand() * 20), 10, 10], 800); // longer than every carton side
    add([10, 8, 5], 200);
  } else if (kind === "overweight") {
    for (let k = 0; k < 6; k++) add([10, 10, 10], 3600); // 21.6 kg > every carton limit
  } else {
    const tall = 36 + Math.floor(rand() * 10); // taller than every carton's height while upright
    add([8, 8, tall], 900, true, tall);
  }
  return {
    id: `impossible-${String(i + 1).padStart(2, "0")}`,
    group: "impossible" as const,
    cartonIds: allIds,
    units: units.map(toFixtureUnit),
    impossibleReason: kind,
  };
}

function random(i: number) {
  const n = 1 + Math.floor(rand() * 8);
  const units: Unit[] = [];
  for (let k = 0; k < n; k++) {
    const raw = [r1(3 + rand() * 22), r1(3 + rand() * 18), r1(2 + rand() * 15)];
    const liquid = rand() < 0.2;
    const dims = sortDesc(raw);
    const unitId = `r${i}-${k}#1`;
    units.push({
      unitId, productId: unitId, name: unitId, dims, baseDims: dims,
      weightG: Math.round(50 + rand() * 1500), fragile: rand() < 0.25, liquid, sensitive: false,
      estimated: false, uprightHeight: liquid ? raw[2] : null,
    });
  }
  return { id: `random-${String(i + 1).padStart(2, "0")}`, group: "random" as const, cartonIds: allIds, units: units.map(toFixtureUnit) };
}

function toFixtureUnit(u: Unit) {
  return { unitId: u.unitId, dims: u.dims, weightG: u.weightG, fragile: u.fragile, liquid: u.liquid, uprightHeight: u.uprightHeight };
}

const fixtures = [
  ...Array.from({ length: 20 }, (_, i) => knownFeasible(i)),
  ...Array.from({ length: 20 }, (_, i) => impossible(i)),
  ...Array.from({ length: 20 }, (_, i) => random(i)),
];

const out = {
  _note: "GENERATED by scripts/gen-packing-fixtures.ts (seeded, reproducible). Do not edit by hand.",
  seed: SEED,
  fixtures,
};
fs.writeFileSync(path.join(process.cwd(), "data", "packing_fixtures.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${fixtures.length} fixtures (seed ${SEED}).`);

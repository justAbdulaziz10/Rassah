# Stack 03: Packing Engine, Validator, Cost Model, Instructions

**Owner:** M2. **Reviewer:** M1.
**Location:** `lib/engine/`. Pure TypeScript: **no network, no database, no randomness without a seed.** It is fully unit-testable.

```
lib/engine/
├── types.ts          Item, Carton, Placement, Layout, PackResult, Violation
├── geometry.ts       rotations, overlap/contact helpers, EPS
├── prepare.ts        facts → effective item dimensions (margin + padding), expand quantities
├── packer.ts         extreme-point search with rules + strategies
├── baseline.ts       naive first-fit (no gravity, no handling rules) for evaluation only
├── validator.ts      independent checks (no imports from packer.ts)
├── cost.ts           carton + volumetric shipping estimate
└── instructions.ts   human-readable packing steps
```

## 1. Coordinate model

- Carton inner space: `x ∈ [0, L]`, `y ∈ [0, W]`, `z ∈ [0, H]`. **z is up.** Gravity points to `−z`.
- An item placement is an axis-aligned box: origin `(x, y, z)` + size `(dx, dy, dz)`.
- Units: centimetres (floats) and grams. `EPS = 1e-6` for all comparisons.
- **Always use the carton's INNER dimensions.** Outer dimensions are used only for volumetric weight.

## 2. From facts to items (`prepare.ts`)

1. Expand quantities: product `p-07` × 2 → units `p-07#1`, `p-07#2`.
2. Base dims = AI/manual facts sorted `L ≥ W ≥ H`. The fact's `heightCm` (natural upright side) is kept separately as `uprightHeight` for liquids.
3. **Safety margin** for estimated values: if `dimsSource = "inferred"`, multiply each dimension by `1 + MARGIN_INFERRED` (default **0.15**, justified by the extraction eval error; see Stack 07).
4. **Protective padding**: if `fragile` or `sensitive`, add `PADDING_CM` (default **1.5 cm**) on every side, so +3 cm per dimension.
5. Allowed rotations:
   - Normal item: all **6** axis permutations (deduplicated when sides are equal).
   - **Liquid** item: only the 2 rotations that keep the original height vertical ("this side up").
6. Hard limits (input validation): 1–12 units per order, every dimension > 0, weight > 0, unknown values → `needs_measurement` (the engine never runs on unknowns).

## 3. Packing rules (enforced by the packer AND re-checked by the validator)

| Rule | Definition |
|---|---|
| R1 In bounds | `0 ≤ x`, `x + dx ≤ L` (same for y/W, z/H) |
| R2 No overlap | For every pair, the boxes are separated on at least one axis: `a.x + a.dx ≤ b.x` or `b.x + b.dx ≤ a.x` or the same on y or z (with EPS) |
| R3 Weight | Sum of unit weights ≤ carton `maxWeightG` |
| R4 **Support (gravity)** | `z = 0`, **or** the item's base rests on the top faces of items directly below (`below.z + below.dz = item.z`), with total contact area ≥ `MIN_SUPPORT` (default **0.70**) of the item's base area |
| R5 **Nothing on fragile** | No item may rest on (touch the top face of) a fragile item |
| R6 **Liquid upright** | A liquid item's vertical size equals its original height |
| R7 Completeness | Every requested unit is placed exactly once. No extras, no duplicates. |

Support contact area between item `a` (above) and `b` (below), when `|b.z + b.dz − a.z| < EPS`:

```
overlapX = max(0, min(a.x + a.dx, b.x + b.dx) − max(a.x, b.x))
overlapY = max(0, min(a.y + a.dy, b.y + b.dy) − max(a.y, b.y))
contact  = overlapX × overlapY
supportRatio(a) = Σ contact(a, b) / (a.dx × a.dy)
```

## 4. Search algorithm (`packer.ts`)

**Extreme-point placement with gravity**, run under several item orderings, for every carton.

```
for carton in cartons sorted by (cartonCost, volume):
    if any single unit can't fit in carton by any allowed rotation → skip (reason: oversize)
    if total weight > carton.maxWeight → skip (reason: overweight)
    for ordering in STRATEGIES:
        layout = greedyPlace(units in ordering, carton)
        if layout is complete:
            candidates.push(layout); break      # cheapest strategy success is enough for this carton
pick candidate with lowest estimated total cost (tie → smallest carton volume)
```

> **Implemented version (after evaluation-driven iteration, see `docs/report/results.md`):**
> - **Candidate positions = corner grid.** Every combination of x ∈ {0, right edges}, y ∈ {0, back edges}, z ∈ {0, top faces} of placed boxes. This is a superset of classic extreme points.
> - **9 fixed strategies.** The 7 below plus `volume_tight_x` and `volume_tight_y`, which use a "tight" score: gravity, then the smallest far edge along x or y. That score stands a thin item on its side to fill an exact strip.
> - **Then up to 40 seeded restarts per carton.** Random orderings from a fixed seed (order + carton id), cycling the 4 scores and fragile-last on/off. Each carton's restarts stop at its fair share of the remaining budget, so larger cartons still get searched. Same input → same output.
> - Known-feasible recall on the 100%-fill fixtures: 3/20 (extreme points) → 9/20 (corner grid + restarts) → 15/20 (tight scores, engine-0.1) → **20/20** (engine-0.2: after the greedy passes and restarts, a bounded backtracking anchor search takes the lowest uncovered corner and tries every remaining unit in every rotation, with a node limit of `anchorNodes`). Engine validity stays 100%, false claims on impossible cases stay 0, p95 runtime is about 13 ms.

`STRATEGIES` are tried in order. Each is (item ordering, whether fragile units go last, position score):

| # | Ordering (desc) | Fragile last | Score |
|---|---|---|---|
| 1 | volume | yes | lowest top |
| 2 | base area (`L × W`) | yes | lowest top |
| 3 | weight (heavy at the bottom) | yes | lowest top |
| 4 | longest side | yes | lowest top |
| 5 | volume | yes | lowest base |
| 6 | volume | no | lowest top |
| 7 | base area | no | lowest base |

- **Lowest top** picks the position with the smallest resulting top surface (`z + dz`), then `z`, `y`, `x`. It keeps flat, even layers and stops wasteful placements, such as a book stood on its edge.
- **Lowest base** is classic gravity-first: smallest `z`, then `y`, then `x`.
- **Fragile last** usually makes R5 easy to satisfy. But a large fragile item sometimes needs the floor first (e.g. a plate set next to a box of dates), so strategies 6–7 drop that ordering. R5 is still enforced by the placement check in every strategy.

Found on the sanity run over the 20 seeded orders: with only z-first scoring and fragile-last, order 1012 wasted an L carton (chose XL) and order 1013 found no carton at all. Both are fixed by strategies 1 and 6.

`greedyPlace`:

```
points = [(0,0,0)]
for unit in ordering:
    best = null
    for p in points:
        for rot in allowedRotations(unit):
            box = (p, rot)
            if fitsInBounds(box) and noOverlap(box, placed)
               and supportRatio(box, placed) ≥ MIN_SUPPORT
               and not restsOnFragile(box, placed):
                score = (box.z + box.dz, box.z, box.y, box.x)   # "lowest top" mode (see table)
                keep box if score < best.score
    if best is null: return INCOMPLETE
    placed.push(best)
    points += [(x+dx, y, z), (x, y+dy, z), (x, y, z+dz)]   # new extreme points
    dedupe points; drop points outside the carton
return placed
```

- **Deterministic:** same input → same output. No randomness.
- **Search budget:** stop after `MAX_SEARCH_MS` (default 1500 ms) and return the best found so far. Record `candidatesChecked`.
- **Honesty:** "not found" is **not** proof that no packing exists. The UI says *"No valid carton found within the search budget"*.
- **Complexity:** ≤ 12 units × ~40 points × ≤ 6 rotations × 4 strategies × 5 cartons. Far below the budget.

## 5. Independent validator (`validator.ts`)

- **Must not import anything from `packer.ts`.** Re-implement the checks from the rule table above. A shared bug in both would hide errors, which is the whole point of keeping them separate.
- Input: requested units (with effective dims, flags, weights), carton, placements.
- Output: `{ valid: boolean, violations: Violation[] }` with codes:
  `out_of_bounds`, `overlap`, `overweight`, `floating`, `on_fragile`, `liquid_tipped`, `dim_mismatch` (placed size isn't a rotation of the item), `missing_item`, `duplicate_item`.
- The API **only shows a layout if `valid = true`**. Any violation on our own engine's output means an engine bug. It is counted (`validatorRejections`, metric M3) with its violations, and it raises a **critical** alert. The packer then tries the next strategy for that carton. If none passes, the carton's outcome is `validator_rejected`.
- The validator also runs on the **naive baseline** during evaluation. That is where it is expected to catch `floating` and `on_fragile` layouts, and it shows why the rules matter.

## 6. Naive baseline (`baseline.ts`, evaluation only)

The "what a simple tool would do" comparison: volume-descending first-fit over extreme points, all 6 rotations, **no support rule, no fragile rule, no liquid rule**, smallest-volume carton first. We report how often its layouts fail our validator and how its carton choice and cost compare with the engine.

## 7. Cost model (`cost.ts`). Every number is an *estimate* and labeled as such.

```
outerCm          = innerCm + 2 × WALL_CM            (WALL_CM default 0.5)
volumetricKg     = outerL × outerW × outerH / VOLUMETRIC_DIVISOR   (default 5000, configurable per courier)
actualKg         = (Σ unit weights + carton.tareG) / 1000
chargeableKg     = max(actualKg, volumetricKg)
shippingSar      = BASE_SAR + PER_KG_SAR × max(0, ceil(chargeableKg) − 1)
totalSar         = carton.costSar + shippingSar
```

`BASE_SAR`, `PER_KG_SAR` and carton costs are **synthetic demo values** in `data/cartons.json`. The UI and report label them "estimated / illustrative". Never present them as real courier rates.

## 8. Packing instructions (`instructions.ts`)

Deterministic text generated from the validated layout (no LLM, so it is free, instant, and can't hallucinate):

1. "Use carton **M** (30 × 20 × 15 cm)."
2. Items in placement order (bottom to top), e.g. "Place **book** flat at the bottom."
3. Per flag:
   - fragile: "Wrap **perfume** in bubble wrap (≥ 1.5 cm) and place it last, on top."
   - liquid: "Keep **olive oil** upright, mark the box *This side up*."
   - sensitive: "Pad **power bank** on all sides."
4. Estimated dimensions: "⚠ **Perfume** size is estimated. Check the fit before sealing."
5. "Fill remaining gaps with void fill."

Arabic is the UI language. Keep the templates in one file (`instructions.ar.ts`) so they're easy to review.

## 9. Configuration (`lib/engine/config.ts`)

| Constant | Default | Justification |
|---|---|---|
| `MARGIN_INFERRED` | 0.15 | Set from extraction eval mean error (Stack 07). Update if the eval says otherwise. |
| `PADDING_CM` | 1.5 | Typical bubble-wrap thickness |
| `MIN_SUPPORT` | 0.70 | Common stability heuristic. Documented as an assumption. |
| `MAX_SEARCH_MS` | 1500 | Keeps total request time low |
| `VOLUMETRIC_DIVISOR` | 5000 | Common courier divisor (cm³/kg). Some couriers use 4000 or 6000, so it is configurable. |
| `ENGINE_VERSION` | `engine-0.2` | Stamped into every order event |

## 10. Tests (Vitest), written **before** the packer is finished

Validator:
- Each violation code triggered by a hand-built bad layout (one test per code).
- Exact boundary contact is allowed (item touching the wall, items touching each other).
- A floating item at z > 0 with 50% support → `floating`. With 80% support → OK.

Packer:
- Single item that fits → the smallest carton.
- Item larger than every carton in all rotations → `no_box` with reason `oversize`.
- Overweight order → `no_box` with reason `overweight`.
- Fragile item ends up with nothing on top.
- Liquid item keeps its height vertical.
- Determinism: same input twice → identical output.
- **Property test:** 200 random orders → every returned layout passes the validator.

Cost: volumetric vs actual weight switch-over, rounding of `ceil`.

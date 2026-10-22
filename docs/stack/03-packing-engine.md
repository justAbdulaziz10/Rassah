# Stack 03: Packing Engine, Validator, Cost Model, Instructions

**Location:** `lib/engine/`. Pure TypeScript: **no network, no database, no randomness without a seed.** It is fully unit-testable. Current version: `engine-0.3`.

```
lib/engine/
├── index.ts          packOrder(): prepare → packUnits → split fallback → instructions
├── config.ts         ENGINE_VERSION and ENGINE_CONFIG (§9)
├── types.ts          Unit, Carton, Placement, PackResult, CartonAttempt, Violation, CostEstimate
├── geometry.ts       rotations, overlap/contact helpers, EPS
├── prepare.ts        facts → effective item dimensions (margin + padding), expand quantities
├── packer.ts         packUnits(): corner-point search with rules, strategies, restarts, anchor search
├── split.ts          splitPack(): multi-carton split when no single carton fits (§4.1)
├── baseline.ts       naive first-fit (no gravity, no handling rules) for evaluation only
├── validator.ts      independent checks (no imports from packer.ts)
├── cost.ts           carton + volumetric shipping estimate
├── instructions.ts   packing steps from the validated layout
└── instructions.ar.ts  Arabic text templates
```

## 1. Coordinate model

- Carton inner space: `x ∈ [0, L]`, `y ∈ [0, W]`, `z ∈ [0, H]`. **z is up.** Gravity points to `−z`.
- An item placement is an axis-aligned box: origin `(x, y, z)` + size `(dx, dy, dz)`.
- Units: centimetres (floats) and grams. `EPS = 1e-6` for all comparisons.
- **Always use the carton's INNER dimensions.** Outer dimensions are used only for volumetric weight.

## 2. From facts to items (`prepare.ts`)

1. Expand quantities: product `p-07` × 2 → units `p-07#1`, `p-07#2`.
2. Base dims = AI/manual facts sorted `L ≥ W ≥ H`. The fact's `heightCm` (natural upright side) is kept separately as `uprightHeight` for liquids.
3. **Safety margin** for estimated values: if `dimsSource = "inferred"`, multiply each dimension by `1 + marginInferred` (default **0.15**, justified by the extraction eval error; see Stack 07).
4. **Protective padding**: if `fragile` or `sensitive`, add `paddingCm` (default **1.5 cm**) on every side, so +3 cm per dimension.
5. Allowed rotations:
   - Normal item: all **6** axis permutations (deduplicated when sides are equal).
   - **Liquid** item: only the 2 rotations that keep the original height vertical ("this side up").
6. Hard limits (input validation): 1–12 units per order, every dimension > 0, weight > 0, unknown values → `needs_measurement` (the engine never runs on unknowns).

## 3. Packing rules (enforced by the packer AND re-checked by the validator)

| Rule | Definition |
|---|---|
| R1 In bounds | `0 ≤ x`, `x + dx ≤ L` (same for y/W, z/H) |
| R2 No overlap | For every pair, the boxes are separated on at least one axis: `a.x + a.dx ≤ b.x` or `b.x + b.dx ≤ a.x` or the same on y or z (with EPS) |
| R3 Weight | Sum of unit weights + carton `tareG` ≤ carton `maxWeightG` |
| R4 **Support (gravity)** | `z = 0`, **or** the item's base rests on the top faces of items directly below (`below.z + below.dz = item.z`), with total contact area ≥ `minSupport` (default **0.70**) of the item's base area |
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

The first design was extreme-point placement under a few item orderings. Evaluation-driven iteration (see [docs/report/results.md](../report/results.md)) changed it to:

- **Candidate positions = corner grid.** Every combination of x ∈ {0, right edges}, y ∈ {0, back edges}, z ∈ {0, top faces} of placed boxes. This is a superset of classic extreme points.
- **Cheap pre-checks per carton.** A unit that fits in no rotation → `oversize`; total weight + tare over the limit → `overweight`; total volume larger than the carton → `no_layout`. These cartons are not searched.
- **Phase 1, greedy passes:** the **9 fixed strategies** below, then up to **40 seeded restarts** per carton (random orderings from a fixed seed of order + carton id, cycling the scores and fragile-last on/off). Each carton's restarts stop at its fair share of the remaining budget, so larger cartons still get searched. The first layout that passes the validator is that carton's answer.
- **Phase 2, anchor search (engine-0.2):** on unpacked cartons that would beat every carton already packed, a bounded backtracking search takes the lowest uncovered corner and tries every remaining unit in every rotation, up to `anchorNodes` nodes.
- **Choice:** the packed carton with the lowest estimated total cost (carton + shipping); ties go to the smaller carton.
- Known-feasible recall on the 100%-fill fixtures: 3/20 (extreme points) → 9/20 (corner grid + restarts) → 15/20 (tight scores, engine-0.1) → **20/20** (engine-0.2). Engine validity stays 100%, false claims on impossible cases stay 0, p95 runtime 12.9 ms.

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
| 8 | volume | yes | tight x |
| 9 | volume | yes | tight y |

- **Lowest top** picks the position with the smallest resulting top surface (`z + dz`), then `z`, `y`, `x`. It keeps flat, even layers and stops wasteful placements, such as a book stood on its edge.
- **Lowest base** is classic gravity-first: smallest `z`, then `y`, then `x`.
- **Tight x / tight y** score gravity first, then the smallest far edge along x or y. That stands a thin item on its side to fill an exact strip.
- **Fragile last** usually makes R5 easy to satisfy. But a large fragile item sometimes needs the floor first (e.g. a plate set next to a box of dates), so strategies 6–7 drop that ordering. R5 is still enforced by the placement check in every strategy.

Found on the first sanity run over the 20 seeded orders: with only z-first scoring and fragile-last, order 1012 wasted an L carton (chose XL) and order 1013 found no carton at all. Both were fixed by strategies 1 and 6.

`greedyPlace` places units one by one in the strategy's order. For each unit it tries every candidate position and allowed rotation, keeps those that are in bounds, overlap nothing, have support ≥ `minSupport` and rest on no fragile item, and picks the best by the strategy's score. If a unit has no valid position, the pass is incomplete.

- **Deterministic for the same input:** restarts use a fixed seed. The search runs against a wall-clock budget, so a much slower machine can stop earlier and return a different (still validated) answer.
- **Search budget:** `maxSearchMs` (default 1500 ms) per order. Cartons not reached are recorded as `search_budget`. `candidatesChecked` is recorded.
- **Honesty:** "not found" is **not** proof that no packing exists. The reason is *"No valid carton found within the search budget"*.

### 4.1 Multi-carton split (`split.ts`, engine-0.3)

Used only when no single carton fits the whole order. `splitPack` groups the units first-fit-decreasing, one box at a time, and asks `packUnits` for each group, so every box is a normal single-carton answer (searched, validated, priced). Two orderings are tried (largest first, heaviest first), each followed by a pass that tries to empty the last box into the others; the cheaper complete plan wins. At most 4 boxes. The run keeps `status = no_box`; the response carries `split` and the strategy is recorded as `split_N`. The split is a heuristic, not a proven cheapest split.

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
outerCm          = innerCm + 2 × wallCm             (wallCm default 0.5)
volumetricKg     = outerL × outerW × outerH / volumetricDivisor   (5000, in data/cartons.json)
actualKg         = (Σ unit weights + carton.tareG) / 1000
chargeableKg     = max(actualKg, volumetricKg)
shippingSar      = baseSar + perKgSar × max(0, ceil(chargeableKg) − 1)
totalSar         = carton.costSar + shippingSar
```

`baseSar` (18), `perKgSar` (3), `volumetricDivisor` and carton costs are **synthetic demo values** in `data/cartons.json` (`shipping`). The UI and report label them "estimated / illustrative". Never present them as real courier rates.

## 8. Packing instructions (`instructions.ts`, `instructions.ar.ts`)

Deterministic text generated from the validated layout (no LLM, so it is free, instant, and can't hallucinate):

1. "Use carton **M** (30 × 20 × 15 cm)."
2. Items in placement order (bottom to top), e.g. "Place **book** flat at the bottom."
3. Per flag:
   - fragile: "Wrap **perfume** in bubble wrap (≥ 1.5 cm) and place it last, on top."
   - liquid: "Keep **olive oil** upright, mark the box *This side up*."
   - sensitive: "Pad **power bank** on all sides."
4. Estimated dimensions: "⚠ **Perfume** size is estimated. Check the fit before sealing."
5. "Fill remaining gaps with void fill."

Arabic is the UI language. The templates are in one file (`instructions.ar.ts`) so they're easy to review; the examples above are English paraphrases. Each step is `{ step, unitId, text, notes }`.

## 9. Configuration (`lib/engine/config.ts`)

| Constant | Default | Justification |
|---|---|---|
| `marginInferred` | 0.15 | Set from extraction eval mean error (Stack 07). Update if the eval says otherwise. |
| `paddingCm` | 1.5 | Typical bubble-wrap thickness |
| `minSupport` | 0.70 | Common stability heuristic. Documented as an assumption. |
| `maxSearchMs` | 1500 | Keeps total request time low |
| `restarts` | 40 | Seeded orderings per carton after the fixed strategies |
| `anchorNodes` | 10000 | Node limit per carton for the anchor search |
| `wallCm` | 0.5 | Wall thickness for outer dimensions (volumetric weight) |
| `maxUnits` | 12 | Input cap per order |
| `eps` | 1e-6 | Geometric tolerance |
| `ENGINE_VERSION` | `engine-0.3` | Stamped into every order event (env `ENGINE_VERSION` overrides) |

The volumetric divisor (5000 cm³/kg; some couriers use 4000 or 6000) is in `data/cartons.json`, not in `config.ts`.

## 10. Tests (Vitest)

Files: `tests/engine/validator.test.ts`, `packer.test.ts`, `prepare.test.ts`, `anchor-search.test.ts`, `split.test.ts`, `cost-instructions-baseline.test.ts`.

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
- **Property test:** 200 seeded random orders → every returned layout passes the validator.

Cost: volumetric vs actual weight switch-over, rounding of `ceil`.

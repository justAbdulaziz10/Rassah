# Stack 07: Offline Evaluation & Benchmarks

**Owners:** M1 (extraction), M2 (packing). **Reviewer:** M3.

Monitoring tells us how the live system behaves. **Evaluation** tells us whether it works as intended, on a fixed labeled dataset, so results are comparable across prompt and engine versions.

## 1. Datasets (`data/`)

> **Synthetic data, stated openly.** Products are written by the team in the style of Saudi store pages (Salla/Zid). They do not come from real stores, and no real merchant data is used. The report and Q&A say this explicitly. The next step after the camp is a pilot with a real merchant's catalog.

### `products.json` (30 products)

| Group | Count | Text contains | Purpose |
|---|---|---|---|
| A. Explicit | 15 | Dimensions + weight in **varied formats**: Arabic-Indic digits, "×" and "x", inches/lb, "الطول/العرض/الارتفاع", dims buried in a paragraph | Tests reading and unit conversion |
| B. Inferable | 12 | No dimensions, but clues: "100 مل", "250 صفحة", "مقاس XL", "علبة 12 قطعة", known product types | Tests inference + honesty about uncertainty |
| C. No info | 3 | Vague text only ("هدية فاخرة مميزة") | Model must return `unknown`, not invent values |

Category mix, rigid products only: perfumes, oud and incense burners (ceramic), skincare (glass and plastic), honey and olive oil (glass, liquid), books, mugs, phone accessories, power banks, small appliances, dates boxes, candles (glass).

Each product: `id`, `name`, `description` (the page text), `category`, `url` (illustrative).

### `ground_truth.json`

Per product, written **by a different member than the one who wrote the description** (reduces bias):
`lengthCm, widthCm, heightCm, weightG, fragile, liquid, sensitive, expectedDimsSource (page|inferred|unknown)`.

For group B, ground truth is the "real" box size we define for the product. It is **removed from the text** given to the model.

### `cartons.json` (5)

| id | inner (cm) | max weight | cost (SAR, synthetic) |
|---|---|---|---|
| S | 20 × 15 × 10 | 3 kg | 0.9 |
| FLAT | 35 × 25 × 6 | 3 kg | 1.1 |
| M | 30 × 20 × 15 | 8 kg | 1.6 |
| L | 40 × 30 × 25 | 15 kg | 2.6 |
| XL | 50 × 40 × 35 | 20 kg | 3.8 |

### `orders.json` (20)

1–4 product lines per order, quantities 1–3. Each order has an `expect` note saying what it tests. They include: a fragile + heavy mix, two liquids, an order with an inferred-dimension product, an order with a group-C product (→ `needs_measurement`), and an order heavier than every carton's limit (→ `no_box`, overweight). Order 1020 needs more than one carton (engine-0.3 splits it; see [results.md](../report/results.md)).

## 2. Extraction evaluation: `scripts/eval-extraction.ts` (M1)

`npm run eval:extraction`. Runs the **real** extractor on all 30 products (bypassing the cache, `trigger='eval'`), compares with ground truth, and writes `eval/results/extraction-<date>-<prompt>.json`, plus `eval_runs` (kind `extraction`) + `eval_results` in Supabase. Scoring is in `lib/eval/` and unit-tested (`tests/eval/extraction-score.test.ts`). Results are reported for all products, the 20 tuning products and the 10 holdout products separately.

| Metric | Definition | Group | Why it matters |
|---|---|---|---|
| Dim accuracy ±1 cm | % of the 45 dimension values (15 × 3) within 1 cm (after sorting L ≥ W ≥ H) | A | Reading correctness |
| Weight accuracy ±10% | % of weights within 10% | A | Reading + unit conversion |
| **Inferred dim MAPE** | mean absolute % error of each dimension | B | **Sets `marginInferred`**: margin ≈ observed error (rounded up) |
| Source correctness | % where returned source = expected source | A+B+C | Model knows when it is guessing |
| **Honesty rate** | % of group C returned as `unknown` (no invented numbers) | C | Hallucination guard |
| **Fragile recall** | fragile items detected ÷ all fragile items | all | Missing glass = broken order (the costly error) |
| Fragile precision | correct fragile flags ÷ all fragile flags | all | Too many false flags = wasted padding |
| Liquid accuracy | % correct liquid flags | all | Liquid upright rule depends on it |
| Parse success | % of responses passing Zod | all | Pipeline reliability |
| Avg latency, avg tokens, cost per product | from usage metadata | all | Performance and cost baseline |

**Before/after protocol** (for prompt changes): run the eval, change the prompt, bump `PROMPT_VERSION`, run again, and report both rows. Never tune on a product, then report on that same product only. Keep 10 products as a **holdout**, look at their results only at the end, and report holdout numbers separately.

Free-tier note: the script runs sequentially with a small delay between products to respect rate limits.

## 3. Packing evaluation: `scripts/eval-packing.ts` (M2)

`npm run eval:packing`. No network. Deterministic. It measures the single-carton search (`packUnits`), not the multi-carton split. CI runs it on every push. Read-only by default; `-- --write` writes `eval/results/packing-<date>-<engine>.json`. When Supabase env vars are set it also stores `eval_runs` (kind `packing`) + `eval_results`.

**60 generated fixtures** (`data/packing_fixtures.json`, created by `npm run gen-fixtures` from a fixed seed so they are reproducible):

| Group | Count | Construction | Known answer |
|---|---|---|---|
| Known-feasible | 20 | Start from a carton and recursively split it into boxes (guillotine cuts), assign weights, flag ~25% fragile only on boxes in the **top layer**, then shuffle | A valid packing exists in that carton (the construction is the witness) |
| Impossible | 20 | One item larger than every carton in all rotations, total weight above every carton's max, or a liquid taller than every carton's height | No valid layout exists |
| Random | 20 | Random items within realistic ranges | Unknown, used for stress, runtime and baseline comparison |

| Metric | Definition | Target |
|---|---|---|
| Validity of engine layouts | engine layouts passing the validator ÷ engine layouts returned | **100%** (hard gate) |
| Known-feasible recall | known-feasible fixtures where the engine finds any valid layout ÷ 20 | Report actual (aim ≥ 90%) |
| Impossible-case false claims | impossible fixtures where the engine claims a layout | **0** |
| Baseline invalidity | naive baseline layouts failing the validator, broken down by code (`floating`, `on_fragile`, `liquid_tipped`) | Report actual. Shows why the rules exist. |
| Carton/cost vs baseline | on fixtures where **both** produce a *valid* layout: mean difference in estimated total cost | Report actual. Don't claim savings that weren't measured. |
| Runtime p50 / p95 | engine time per fixture | p95 within `maxSearchMs` |

Fair comparison rules: same fixtures, same carton catalog, same cost model, same time budget, same validator for both. The broader head-to-head benchmark against other packers (`npm run bench`) has its own protocol in [docs/benchmark.md](../benchmark.md).

## 4. Where results go

1. `eval_runs` + `eval_results` in Supabase → **`/evaluation` page** (latest run per kind, plus the previous run for comparison).
2. `eval/results/*.json` (and the benchmark's `.md`) committed to git, so results are reproducible and reviewable.
3. `docs/report/results.md` → tables pasted into the final report.

## 5. External references

The references actually used, and what is still uncited, are listed in [REPORT.md §13](../report/REPORT.md#13-references). No courier page has been cited yet for the volumetric divisor 5000 (`data/cartons.json`).

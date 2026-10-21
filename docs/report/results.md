# Evaluation & Monitoring Results

> Filled from `eval/results/*.json` and the dashboard. Do not type numbers by hand that don't come from those sources.

## Extraction evaluation

_Pending: needs the Gemini key (CHECKLIST P9.15)._

## Packing evaluation

Source: `eval/results/packing-2026-10-21-engine-0.2.json` (`npm run eval:packing`, 60 seeded fixtures, seed 20261022, no network).

| Metric | Result | Target |
|---|---|---|
| Engine layouts passing the independent validator | **40 / 40 (100%)** | 100% (hard gate) |
| Known-feasible recall (100%-fill tight fixtures, witness carton only) | **20 / 20 (100%)** | report actual (aim ≥ 90%) |
| False "packed" claims on impossible fixtures | **0 / 20** | 0 |
| Naive baseline layouts failing the validator | **20 / 28 (71%)**: liquid tipped 17, on fragile 7, floating 2 (the baseline now respects carton weight limits, see below) | report actual |
| Fixtures where the engine is valid and the baseline is not | 32 | — |
| Mean estimated cost saving vs baseline (both valid) | 0 SAR over 8 fixtures | report actual, no claimed savings |
| Engine runtime p50 / p95 | 0.3 / 12.9 ms | p95 ≤ 1500 ms budget |

**Reading it honestly:**
- The engine never shows an impossible layout and never claims an impossible case.
- The naive baseline breaks a real-world rule in most layouts. That is the case for the rules and the independent validator.
- On the 8 fixtures where both are valid, they chose equally priced cartons. **We do not claim cost savings** from this benchmark. The 0 SAR is by construction, not a bug: both packers pick the cheapest carton that fits, the carton price list is ordered by size, and one of those 8 fixtures offers a single carton. Where the baseline is invalid and engine and baseline differ in carton (2 of 14 comparable cases: one cheaper, one costlier), the baseline's cheaper carton is the price of the rules it broke.
- The baseline previously ignored carton weight limits, which inflated its failure count with 7 "overweight" layouts. That was an unfair strawman (py3dbp respects weight), so it now skips cartons that are too weak. Baseline layouts dropped from 35 to 28 as a result. The engine's own numbers are unaffected by this change.
- All 20 exact-fill (zero slack) cases are now found (engine-0.1 missed 5). Real orders have slack, so this is a stress test, not a typical load. All 20 seeded store orders resolve as designed (18 cartons found or measurement requested as intended, and order 1020 correctly reported as overweight for every carton).

### Iteration history (evaluation-driven)

| Engine change | Known-feasible recall | Validity | p95 |
|---|---|---|---|
| Extreme points, 7 strategies | 3 / 20 | 23 / 23 | 5.6 ms |
| + corner-grid candidates + 40 seeded restarts | 9 / 20 | 29 / 29 | 31 ms |
| More restarts (100 / 300) | 9 / 20 (no gain) | 29 / 29 | 76 / 179 ms, rejected |
| + "tight_x / tight_y" position scores (engine-0.1) | 15 / 20 | 35 / 35 | 31 ms |
| + backtracking anchor search (engine-0.2) | **20 / 20** | **40 / 40** | **12.9 ms** |

Diagnosis that led to the last change: fixture `feasible-05` (3 items) failed because every score preferred flat orientations, while the exact solution needs a 3.4 cm item standing on its side. A regression test now covers it.

## Investigation story

_Pending (CHECKLIST P8.45–P8.46). The packing iteration above is a real eval-driven investigation and can be used if no live-dashboard story happens._

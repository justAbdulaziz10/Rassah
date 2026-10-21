# Evaluation & Monitoring Results

> Filled from `eval/results/*.json` and the dashboard. Do not type numbers by hand that don't come from those sources.

## Extraction evaluation

Source: `eval/results/extraction-2026-10-21-v1.json` (`npm run eval:extraction`; model `gemini-3.5-flash-lite`, prompt `v1`; 30 products, 30/30 calls ok, synthetic data). Numbers below are run 2 (Supabase eval run 7df0b26c); run 1 (195cf93f) is kept as the previous run. Two runs were made (same model and prompt): estimated-dim MAPE 14.3% -> 12.9%, holdout 18.2% -> 16.1%, and one fragile false positive in run 2. This is LLM run-to-run variation; the committed file and the /evaluation page show run 2 (latest), run 1 is "previous". Tuning = 20 products, holdout = 10 products (looked at only after the prompt decision).

| Metric | All (30) | Tuning (20) | Holdout (10) |
|---|---|---|---|
| Parse success | 100% | 100% | 100% |
| Dim accuracy within 1 cm (group A) | 100% | 100% | 100% |
| Weight accuracy within 10% (group A) | 100% | 100% | 100% |
| Inferred dim MAPE (group B) | **12.9%** | 11.3% | **16.1%** |
| Inferred weight MAPE (group B) | 13.5% | 11.9% | 16.7% |
| Inferred products answered (group B) | 12/12 | 8/8 | 4/4 |
| Source correctness | 100% | 100% | 100% |
| Honesty (group C returned `unknown`) | 100% | 100% | 100% |
| Fragile recall / precision | 100% / 90.9% | 100% / 87.5% | 100% / 100% |
| Liquid accuracy | 100% | 100% | 100% |
| Sensitive accuracy | 100% | 100% | 100% |
| Avg latency | 1795 ms | 1976 ms | 1433 ms |
| Avg tokens | 632 | 632 | 633 |
| Cost per product | $0.000452 | $0.000453 | $0.000450 |

**Prompt decision (P9.16):** every non-holdout (tuning) metric is perfect except the inferred-estimate errors (dim MAPE 11.3%, weight MAPE 11.9%, plus one fragile false positive). Those are estimates from clues (ml, pages, pieces), not extraction failures, so there is no failure pattern to fix with a prompt change. Decision: **no prompt change**, `PROMPT_VERSION` stays `v1`, so there is no before/after pair.

**Margin decision (P9.19):** the rule is margin = observed inferred-dimension MAPE, rounded up. The measured MAPE over all 12 inferred products is 12.9%, which rounds up to **15%**, so `MARGIN_INFERRED` stays at 0.15. Caveat: the holdout MAPE (16.1%, only 4 inferred products) is above 15%, so the margin does not cover every estimate. The 11.3% / 16.1% spread on 8 and 4 products shows this is noisy; the pack instructions already say "check the fit" for estimated sizes. Raising the margin to 20% would trade carton cost for cover and is the first change to make if a real-merchant pilot confirms the higher error.

**Model note:** `gemini-3.5-flash-lite`, $0.30 / 1M input and $2.50 / 1M output (ai.google.dev pricing, 2026-10-21). Free tier 15 RPM / 500 RPD (AI Studio rate-limit page, 2026-10-21). See `docs/decisions.md` for why `gemini-3.8-flash` and `gemini-3.6-flash` were not used.

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

# Cross-lane walkthroughs (P11.44 to P11.49)

> One section per file group. The presenter is **not** the author: that is the point of the checklist items. Line numbers refer to the code as of 2026-10-21; if a file changes, re-check them. Numbers come from `docs/report/results.md`. Lanes: M1 = AI and data, M2 = engine, M3 = platform and monitoring (`docs/PLAN.md`).

---

## 1. `lib/engine/validator.ts` (P11.44)

**Presents: M1. Author: M2.**

**Summary**
1. The validator is the last gate: no layout reaches the packer's screen unless `validateLayout` returns `valid: true`.
2. It takes the units, the carton and the placements, and returns a list of violations (or none).
3. It deliberately imports only types (`validator.ts:7`); the header (`validator.ts:3-5`) says it must not import `packer.ts` or `geometry.ts`, so a bug in shared helpers cannot hide in both.
4. It re-implements each rule in plain math: bounds, overlap, weight, gravity support, fragile, liquid, completeness.
5. The packer calls it after every candidate layout (`packer.ts:447`), and rejections are counted (metric M3, must be 0).

**3 key points to say**
- *Independence:* "validator.ts imports nothing from the packer or geometry code" (`validator.ts:3-7`).
- *Rules:* completeness (`:39-53`), rotation-only size (`:61`), liquid stays upright (`:70`), inside inner dims (`:79-84`), no overlap on all three axes (`:88-99`), weight including carton tare (`:101-109`), at least `minSupport` of the base supported and nothing on a fragile item (`:112-133`).
- *Where it is used:* `packer.ts:447` runs it on every layout; on failure the layout is dropped and `validatorRejections` goes up, which feeds M3 and the critical alert in `alerts.ts:57-70`.

**Likely judge questions**
- *Why a second checker?* The LLM understands, the engine computes, the validator proves. Independent code means a geometry bug in the packer cannot also be in the checker.
- *Does it prove optimality?* No. It proves a layout is physically valid under our rules, not that it is the cheapest or tightest.
- *How well does it work?* All 40 engine layouts in the packing eval pass it (`results.md`, 40 / 40), and there were 0 false "packed" claims on 20 impossible fixtures.

---

## 2. `lib/ai/extractor.ts` + `lib/ai/prompt.ts` (P11.45)

**Presents: M2. Author: M1.**

**Summary**
1. `extractFacts` turns one product's name and description into structured shipping facts.
2. The network call is injected (`generate`, `extractor.ts:10-24`), so tests use recorded responses and the file never imports the Gemini SDK.
3. The prompt (`prompt.ts:7-33`) asks for outer-package size in cm and g, a source for dims and weight (`page` / `inferred` / `unknown`), and fragile / liquid / sensitive flags.
4. Output goes through JSON parse, a Zod schema and `sanitize`, so bad answers become `unknown` or an error status, never a guess.
5. Every call returns an event (status, latency, tokens, cost, model, prompt version) for monitoring.

**3 key points to say**
- *Honesty rules in the prompt:* "unknown: ... NEVER invent a number" (`prompt.ts:22`); fragile when unsure (`prompt.ts:25-26`); product text is data, not instructions (`prompt.ts:33`). `PROMPT_VERSION` is stamped into events (`prompt.ts:5`).
- *`sanitize` (`extractor.ts:77-113`):* out-of-range values (over 150 cm or 30 000 g) become unknown, an `unknown` source never carries a value, and `page` with `low` confidence is downgraded to `inferred`.
- *Failure handling in `extractFacts` (`extractor.ts:136-234`):* up to 3 attempts with backoff only for retryable errors (`:156-169`), 20 s timeout (`:144`), distinct statuses (`timeout`, `blocked`, `empty`, `parse_error`, `simulated_outage`), and `simulateOutage` skips the call for the demo (`:148-153`).

**Likely judge questions**
- *What if Gemini is wrong?* Estimated sizes are tagged `inferred`, padded by 15% in the engine, shown as "تقديري", and packer corrections are tracked (M1). Measured inferred-dimension error is 12.9% (holdout 16.1%).
- *What if Gemini is down?* The product is treated as unknown, the order says "needs measurement", and the failure is logged so M6 can alert.
- *Prompt injection from product pages?* The prompt tells the model to treat the text as data (`prompt.ts:33`) and the output is schema-validated and range-checked. This is a mitigation, not a proof.

---

## 3. `lib/engine/packer.ts` + `lib/engine/prepare.ts` (P11.46)

**Presents: M3. Author: M2.**

**Summary**
1. `prepareUnits` converts order lines and product facts into one `Unit` per piece, and refuses to run on missing data.
2. `packUnits` tries cartons from cheapest to most expensive, using extreme-point placement under several item orderings.
3. If the quick passes fail on a carton, a backtracking anchor search (engine-0.2) tries harder within a node limit.
4. Every candidate layout is checked by the independent validator before it can be chosen.
5. Among valid layouts it returns the cheapest estimated total (carton plus shipping), or `no_box` with an honest reason.

**3 key points to say**
- *Honest inputs (`prepare.ts:27-40`):* a missing or `unknown` size or weight returns `needs_measurement`; the engine never runs on guesses. Inferred dims get `(1 + marginInferred)` and fragile or sensitive items get padding on every side (`prepare.ts:45-50`). `marginInferred` is 0.15 and `paddingCm` is 1.5 (`config.ts`).
- *Search (`packer.ts:49-59`, `:416-`):* cartons sorted by cost (`:429`), phase 1 fixed strategies and seeded restarts (`:467`), phase 2 backtracking anchor search only for cartons that could beat the current best (`:511`), all inside a 1500 ms budget (`config.ts`: `maxSearchMs`).
- *Validator gate and honest failure:* each layout goes through `validateLayout` (`:447`); with no valid layout it returns "No valid carton found within the search budget" (`:547`). Final choice is the cheapest total, ties to the smaller carton (`:552-`).

**Likely judge questions**
- *Is it optimal?* No. It is time-bounded search. On 20 exact-fill stress fixtures it finds 20 / 20 (engine-0.1 found 15 / 20); real orders have slack.
- *Did you save money?* No claim. On the 8 fixtures where engine and baseline are both valid, the mean saving is 0 SAR, by construction. The value shown is that the naive baseline breaks a rule in 20 of 28 layouts.
- *How fast?* Engine p50 / p95 is 0.3 / 12.9 ms on the 60 fixtures; budget is 1500 ms.

---

## 4. `lib/monitoring/metrics.ts` + `lib/monitoring/alerts.ts` (P11.47)

**Presents: M1. Author: M3.**

**Summary**
1. `computeMetrics` is a pure function over event arrays and returns seven metrics, M1 to M7; each carries its sample size `n` and a minimum `minN` (`metrics.ts:16-25`).
2. Evaluation traffic (`trigger = "eval"`) is always excluded (`metrics.ts:55-56`).
3. `evaluateRules` in `alerts.ts` checks six rules (M3, M6, M1, M5, M4, M2) on rolling windows of recent events, with minimum samples.
4. `syncAlerts` opens one alert per breached rule and resolves it when it recovers; it can POST to a webhook for non-simulated alerts (`alerts.ts:177-211`).
5. Each metric is tied to a failure it reveals; the dashboard shows "insufficient data" under the minimum.

**3 key points to say**
- *M1 correction rate* (`metrics.ts:58-70`): corrected AI products over reviewed AI products. This is the main AI-quality signal. Alert at above 20% over the last 30 products, warning (`alerts.ts:32-33`, `:91-111`).
- *M3 and M6 are critical* (`alerts.ts:57-89`): any validator rejection in 24 h (threshold 0); Gemini failure rate above 10% over the last 20 calls, minimum 5 (`alerts.ts:29-31`).
- *Simulated outage* (`alerts.ts:76-78`): marked `simulated`, resolves on the first successful call, and never sends the webhook (`alerts.ts:195`).

**Likely judge questions**
- *Why a minimum sample?* One failed call out of two would be a 50% "failure rate"; minimums (for example `m6MinSample: 5`) avoid false alarms and the UI says "insufficient data".
- *Walk through an investigation.* The slow cached orders: M5 showed 358-1896 ms; the response header showed functions in `iad1` while the database is in Frankfurt; moving functions to `fra1` gave 119-234 ms (`results.md`, investigation story).
- *Are thresholds tuned on real traffic?* No. They are starting values chosen by the team (`THRESHOLDS`, `alerts.ts:28-44`) and the data is synthetic.

---

## 5. `app/api/orders/[id]/pack/route.ts` + `lib/pipeline/pack.ts` (P11.48)

**Presents: M2. Author: M3.**

**Summary**
1. The route validates the order number (digits only) and the body, rate-limits, and builds a `runId` (`route.ts:14-30`).
2. It calls `runPack`, which loads the order, products, cartons and rates, then `getOrExtractFacts` (cache first, Gemini for misses), then `packOrder` (`pack.ts:128-165`).
3. `runPack` fills one `OrderRun` record as it goes: cache hits and misses, source mix, timings, tokens, cost, attempts, validator rejections, status.
4. At the end it writes the run and the extraction events (`pack.ts:241-246`), then refreshes alerts (`pack.ts:249-253`).
5. Monitoring writes never break the product: on failure the packer still gets the result, with `monitoring.saved = false`.

**3 key points to say**
- *Events with `run_id`:* one `runId` (`route.ts:30`) links the order run and its extraction events; `insertOrderRun` then `insertExtractionEvents` (`pack.ts:242-243`).
- *Failure isolation:* the write is in try / catch (`pack.ts:241-246`) and alert evaluation is best effort (`pack.ts:249-253`); the result is returned either way. `refreshAlerts` re-evaluates the last 7 days (`pack.ts:259-267`).
- *Demo fault injection:* `simulateOutage` is honored only when `DEMO_MODE` is true (`route.ts:28-29`); status codes are 404 not found, 500 error, else 200 (`route.ts:44`).

**Likely judge questions**
- *What happens if the database is down?* The order lookup fails inside the try block and the response status is `error` (`pack.ts:228-233`). If only the event writes fail, the pack result is still returned and `monitoring.saved` is false.
- *What stops abuse of the route?* A rate limiter (`route.ts:16`), digits-only ids and a strict body schema. There is no authentication; that is out of scope (`PLAN.md` section 4.2).
- *How long can it take?* `maxDuration = 60` (`route.ts:10`). Measured on production: cached 119-234 ms, uncached 1589 ms (`demo-script.md`).

---

## 6. `scripts/eval-extraction.ts` + `lib/eval/extraction-score.ts` (P11.49)

**Presents: M3. Author: M1.**

**Summary**
1. The script runs the real Gemini extractor on all 30 synthetic products, bypassing the cache, with 1500 ms between calls (`eval-extraction.ts:16`, `:36-52`).
2. `score` (`extraction-score.ts:22`) compares results with hand-labeled ground truth, separately for tuning (20) and holdout (10) products.
3. Group A (dims on the page) is scored by dims within 1 cm (after sorting) and weight within 10% (`:27-40`); group B (inferred) by mean absolute percentage error (`:42-55`); group C (no info) by honesty, meaning `unknown` returned (`:59`).
4. It also scores source correctness, fragile recall and precision, liquid and sensitive accuracy, latency, tokens and cost.
5. Results go to `eval/results/extraction-<date>-<prompt>.json` and to Supabase `eval_runs` (`eval-extraction.ts:67-90`), and appear on `/evaluation`.

**3 key points to say**
- *Dataset design:* 30 products in groups A (explicit), B (inferable, 12 products) and C (no basis, 3 products); the 10-product holdout is reported separately.
- *Latest results* (`results.md`): parse 100%, dims within 1 cm 100%, honesty 100%, inferred-dim MAPE 12.9% overall (tuning 11.3%, holdout 16.1%), fragile precision 90.9%.
- *Margin link:* margin = observed MAPE rounded up, so `marginInferred` stays 0.15 (`results.md` margin decision; `eval-extraction.ts:76`).

**Likely judge questions**
- *Is the data real?* No. It is synthetic, in the style of Saudi store pages, and the ground truth was drafted by Claude and needs independent review (P3.12 / P3.16; see `docs/team/ground-truth-review.md`).
- *Your holdout error (16.1%) is above the 15% margin. Why keep 15%?* Over all 12 inferred products the error is 12.9%, which rounds up to 15%; the holdout has only 4 inferred products so it is noisy. We say so openly, and a pilot would re-measure; raising to 20% is the first change if the pilot confirms the higher error.
- *Did you tune on the test set?* The prompt was not changed (`PROMPT_VERSION` stays `v1`), so there is no before and after pair; the holdout was looked at only after that decision (`results.md`).

# Stack 06: Monitoring & Alerting

**Owner:** M3. **Reviewer:** M1.
**Brief requirement:** a dashboard connected to the product that shows metrics relevant to its actual behavior. *"Do not add charts or metrics simply to make the dashboard look comprehensive."* Every metric below names the failure it reveals and how to investigate it.

## 1. What gets logged (event sources)

| Event | Table | Written by | When |
|---|---|---|---|
| Extraction attempt | `extraction_events` | `lib/ai/extractor.ts` | Every Gemini call or simulated failure (one row per attempt, including retries' final outcome) |
| Order run | `order_runs` | `/api/orders/[id]/pack` | Every pack request, success or failure |
| Packer action | `order_runs.employee_action` + `corrections` | `/api/runs/[runId]/action`, `/api/products/[id]/facts` | Confirm / Edit / Measure |
| Alert | `alerts` | `lib/monitoring/alerts.ts` | When a rule is breached (deduplicated: one open alert per rule) |

Rules for event writing:
- **Every run has a `run_id`** generated at the start of the request and passed to every event.
- Event writes must **not** break the product: wrap them in try/catch. On failure, set `monitoring_degraded = true` in the response and show a "Monitoring degraded" badge in the UI. **Never claim an event was saved when it wasn't.**
- Evaluation traffic is tagged `trigger = 'eval'` and **excluded** from live metrics, so test runs don't pollute production numbers.

## 2. The seven metrics

All metrics are computed over a selectable window (**last 1 h / 24 h / 7 d / all**) and always displayed with their **sample size (n)**. A metric with n below its minimum shows "insufficient data" instead of a misleading number.

| # | Metric | Formula | Min n | Category | Failure it reveals | First investigation step |
|---|---|---|---|---|---|---|
| **M1** | **AI correction rate** | products with ≥ 1 correction where `prior_origin='ai'` ÷ distinct AI-extracted products used in confirmed/edited runs | 10 | AI quality | Gemini reads wrong numbers or misclassifies fragile/liquid | Group corrections by `field` and `product.category`, read `evidence`, compare with page text |
| **M2** | **Data-source mix** | share of units by `dims_source` ∈ page / inferred / manual / unknown | 10 | Data quality | Product pages lack data. Accuracy will drop and margins inflate cartons | List products with `inferred`/`unknown`. Fix the store data or measure them |
| **M3** | **Validator rejections** | Σ `validator_rejections` + breakdown of `violations[].code` | 1 | Engine correctness | A packer bug produced an impossible layout (should **always be 0**) | Open the run's `violations`, reproduce with the same order in a unit test |
| **M4** | **No-carton rate** | runs with `status='no_box'` ÷ runs that reached packing | 10 | Engine / catalog fit | Carton catalog too small for the products, or margin/padding too large | Check skip reasons (`oversize`/`overweight`/`search_budget`) and the units' effective dims |
| **M5** | **Order latency p50 / p95**, split cached vs uncached | percentiles of `total_ms`; split by `cache_misses = 0` | 10 | Performance | Slow Gemini, cache not working, engine budget too high | Compare `extract_ms` vs `pack_ms`. Check `cache_misses` |
| **M6** | **Gemini failure rate** | extraction events with `status <> 'ok'` ÷ all extraction events. Breakdown by status | 5 | Health / API failures | Bad/expired key, quota or rate limit (429), outage, schema/parse failures | Breakdown by `status` and `error_code`. Check the health endpoint and AI Studio quota |
| **M7** | **Cost per order** (USD) + **cache-hit rate** | Σ `cost_usd` ÷ runs. `cache_hits` ÷ (`cache_hits` + `cache_misses`) | 10 | Cost | Cache disabled or stale-hash loop, prompt grew too long | Tokens per extraction over time. Count of re-extractions per product |

Why these and not others: **request count** alone, **CPU**, or **"AI accuracy"** as a vague single number would not help find a specific problem. Each metric above maps to one pipeline stage (extraction quality, input data, engine, performance, external API, cost), so an anomaly tells us *where* to look.

## 3. Alert rules (`lib/monitoring/alerts.ts`)

Rules are evaluated **after every order run** and **on every dashboard load** (Vercel Hobby cron is too infrequent for live monitoring, so evaluation is event-driven). A rule only fires when its minimum sample is met, and opens at most one unresolved alert per rule.

| Rule | Condition (rolling window) | Severity | Why this threshold |
|---|---|---|---|
| `M3_validator_rejection` | any rejection in the last 24 h | **critical** | The engine must never produce an invalid layout |
| `M6_gemini_failure_rate` | > 10% of the last 20 extraction events failed | **critical** | Uncached orders can't be processed |
| `M1_correction_rate` | > 20% over the last 30 AI-extracted products | warning | Quality drift. Re-check the prompt with the eval |
| `M5_latency_p95` | uncached p95 > 8 s, or cached p95 > 2 s, over the last 20 runs | warning | Packer waiting time. Cached should be near-instant |
| `M4_no_box_rate` | > 15% of the last 20 runs | warning | Catalog or margin problem |
| `M2_unknown_share` | > 30% of units `unknown` in 24 h | info | Store data quality |

Alert delivery:
- **Dashboard banner** (always): severity color, message, value vs threshold, sample size, "View events" link.
- **Optional webhook** (`ALERT_WEBHOOK_URL`, Discord/Slack): one POST when an alert opens. Skipped when `DEMO_MODE=true` and the alert came from a simulated fault.
- Resolve: an alert auto-resolves when the rule evaluates clean on the next run. `resolved_at` is set.

## 4. Dashboard layout (`/monitoring`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [Alert banner(s)]                    Window: [1h|24h|7d|all]  n=… │
├───────────────┬───────────────┬───────────────┬──────────────────┤
│ M1 Correction │ M6 Gemini     │ M5 p95 latency│ M7 Cost/order    │
│ rate  12% n=… │ fail  0% n=…  │ cached/uncach │ + cache hit %    │
├───────────────┴───────────────┴───────────────┴──────────────────┤
│ M5 latency over time (line, cached vs uncached)                  │
├───────────────────────────────┬──────────────────────────────────┤
│ M2 data-source mix (stacked)  │ M6 failures by status (bar)      │
├───────────────────────────────┼──────────────────────────────────┤
│ M3 validator rejections (=0 ✓)│ M4 no-carton rate + skip reasons │
├───────────────────────────────┴──────────────────────────────────┤
│ Recent runs table: time · order · status · carton · ms · source  │
│ mix · action → click opens the run trace (all events by run_id)  │
└──────────────────────────────────────────────────────────────────┘
```

- KPI tiles: value, sample size, and color only when a threshold is crossed.
- Charts: Recharts. Server-side aggregation via `GET /api/monitoring/metrics?window=24h`, so the browser never receives raw keys or full tables.
- **Run trace view**: for any `run_id`, show the order run, its extraction events (with `evidence`, tokens, latency) and corrections. This is the main investigation tool.

## 5. Fault injection (demo only)

To *demonstrate* that monitoring detects and helps investigate a problem, without waiting for a real outage:

- Enabled only when `DEMO_MODE=true`. A toggle on the order page: **"Simulate Gemini outage"**.
- Effect: the extractor throws `simulated_outage` **before** calling Gemini, for **uncached** products only. (Cached products keep working, which is itself a point worth showing.)
- Events are tagged with `error_code = 'simulated_outage'`, so they are visibly distinguishable from real failures.

**Demo script (≈30 s):**
1. Turn on the toggle. Clear the cache for one product (admin button) and pack an order containing it.
2. The order fails visibly. The dashboard shows **M6 jump**, and the **critical alert** appears.
3. Open the run trace → `status = simulated_outage` → explain that a real outage would show `api_error`/`rate_limited`, and that cached products kept working.
4. Turn off the toggle, re-pack → success → the alert resolves on the next run.

## 6. Prepared investigation story (for the pitch)

Use a **real** iteration from development (PLAN T20). Example of the expected shape (fill in with actual numbers):

> "On the dashboard, M1 correction rate on perfumes was high. The run trace showed Gemini returning the **bottle** size, not the **box** size. We changed the prompt to 'outer packaging dimensions' (prompt v1 → v2), re-ran the extraction eval (perfume dims error X% → Y%), and the correction rate dropped."

Only tell this story if it actually happened, with real numbers. Otherwise, tell whatever real issue the dashboard or eval surfaced.

## 7. Supporting services

- **Vercel function logs and observability** for raw errors and stack traces (linked from the run trace by `run_id` in log lines: `console.log(JSON.stringify({ runId, stage, ... }))`).
- **Supabase SQL editor** for ad-hoc investigation queries (`docs/queries.sql`).

## 8. Tests

- `metrics.ts`: each metric computed from fixture event arrays (including the min-n "insufficient data" case and the eval exclusion).
- `alerts.ts`: each rule fires at threshold + 1 and not at threshold. Dedup works. Auto-resolve works.
- Event writer failure → `monitoring_degraded = true` and the pack still succeeds.

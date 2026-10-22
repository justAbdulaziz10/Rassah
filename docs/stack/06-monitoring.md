# Stack 06: Monitoring & Alerting

**Brief requirement:** a dashboard connected to the product that shows metrics relevant to its actual behavior. *"Do not add charts or metrics simply to make the dashboard look comprehensive."* Every metric below names the failure it reveals and how to investigate it.

Code: `lib/monitoring/metrics.ts` (the seven metrics), `lib/monitoring/alerts.ts` (rules and delivery), `lib/monitoring/dashboard.ts` (data for the page), `components/MonitoringDashboard.tsx` (the page).

## 1. What gets logged (event sources)

| Event | Table | Written by | When |
|---|---|---|---|
| Extraction call | `extraction_events` | built in `lib/ai/extractor.ts`, saved by `lib/pipeline/pack.ts` | Every extraction of an uncached product, including simulated failures. One row per call: retries inside the call are not separate rows; the row holds the final outcome |
| Order run | `order_runs` | `lib/pipeline/pack.ts` (via `/api/orders/[id]/pack`) | Every pack request, success or failure |
| Packer action | `order_runs.employee_action` + `corrections` | `/api/runs/[runId]/action`, `/api/products/[id]/facts` (both through `lib/pipeline/facts.ts`) | Confirm / Edit / Measure |
| Alert | `alerts` | `lib/monitoring/alerts.ts` | When a rule is breached (one open alert per rule) |

Rules for event writing:
- **Every run has a `run_id`** generated at the start of the request and passed to every event.
- Event writes must **not** break the product: they are wrapped in try/catch. On failure the response has `monitoring.saved = false` and the result page shows "لم يُحفظ سجل هذا الطلب في صفحة الأداء. التغليف غير متأثر." **Never claim an event was saved when it wasn't.**
- Evaluation traffic is tagged `trigger = 'eval'` and **excluded** from live metrics, so test runs don't pollute production numbers.

## 2. The seven metrics

All metrics are computed in TypeScript (`computeMetrics`) over a selectable window (**last 1 h / 24 h / 7 d / all**, default 24 h) and always displayed with their **sample size (n)**. A metric with n below its minimum still shows its value, marked "بيانات قليلة" so nobody relies on it.

| # | Metric | Formula | Min n | Category | Failure it reveals | First investigation step |
|---|---|---|---|---|---|---|
| **M1** | **AI correction rate** | products with ≥ 1 correction where `prior_origin='ai'` ÷ distinct AI-extracted products used in confirmed/edited runs | 10 | AI quality | Gemini reads wrong numbers or misclassifies fragile/liquid | Group corrections by `field`, read `evidence`, compare with page text |
| **M2** | **Data-source mix** | share of units by `dims_source` ∈ page / inferred / manual / unknown | 10 | Data quality | Product pages lack data. Accuracy will drop and margins inflate cartons | List products with `inferred`/`unknown`. Fix the store data or measure them |
| **M3** | **Validator rejections** | Σ `validator_rejections` + breakdown of `violations[].code` | 1 | Engine correctness | A packer bug produced an impossible layout (should **always be 0**) | Open the run's `violations`, reproduce with the same order in a unit test |
| **M4** | **No-carton rate** | runs with `status='no_box'` ÷ runs that reached packing (`box_found` + `no_box`) | 10 | Engine / catalog fit | Carton catalog too small for the products, or margin/padding too large | Check skip reasons (`oversize`, `overweight`, `search_budget`, `no_layout`, `validator_rejected`) and the units' effective dims |
| **M5** | **Order latency p50 / p95**, split cached vs uncached | percentiles of `total_ms`, split by `cache_misses = 0`. Error runs are excluded | 10 per split | Performance | Slow Gemini, cache not working, engine budget too high | Compare `extract_ms` vs `pack_ms`. Check `cache_misses` |
| **M6** | **Gemini failure rate** | extraction events with `status <> 'ok'` ÷ all extraction events. Breakdown by status | 5 | Health / API failures | Bad/expired key, quota or rate limit (429), outage, schema/parse failures | Breakdown by `status` and `error_code`. Check the health endpoint and AI Studio quota |
| **M7** | **Cost per order** (USD) + **cache-hit rate** | Σ `cost_usd` ÷ runs. `cache_hits` ÷ (`cache_hits` + `cache_misses`) | 10 | Cost | Cache disabled or stale-hash loop, prompt grew too long | Tokens per extraction over time. Count of re-extractions per product |

Why these and not others: **request count** alone, **CPU**, or **"AI accuracy"** as a vague single number would not help find a specific problem. Each metric above maps to one pipeline stage (extraction quality, input data, engine, performance, external API, cost), so an anomaly tells us *where* to look.

## 3. Alert rules (`lib/monitoring/alerts.ts`)

Rules use rolling "last N" windows over the last 7 days of events, independent of the dashboard's time filter. They are re-evaluated **after every pack**, **after every packer action** (`/api/runs/[runId]/action`; both run after the response is sent, via `after()`) and **on every dashboard load** (Vercel Hobby cron is too infrequent for live monitoring, so evaluation is event-driven). A rule fires only when its minimum sample is met, and opens at most one unresolved alert per rule. The limits live in `THRESHOLDS`; the dashboard reads the same values.

| Rule | Condition (rolling window) | Min sample | Severity | Why this threshold |
|---|---|---|---|---|
| `M3_validator_rejection` | any rejection in the last 24 h | 1 run | **critical** | The engine must never produce an invalid layout |
| `M6_gemini_failure_rate` | > 10% of the last 20 extraction events failed | 5 | **critical** | Uncached orders can't be processed |
| `M1_correction_rate` | > 20% over the last 30 reviewed AI-extracted products | 10 | warning | Quality drift. Re-check the prompt with the eval |
| `M5_latency_p95` | uncached p95 > 8 s, or cached p95 > 2 s, over the last 20 non-error runs | 5 | warning | Packer waiting time. Cached should be near-instant |
| `M4_no_box_rate` | > 15% of the last 20 runs that reached packing | 10 | warning | Catalog or margin problem |
| `M2_unknown_share` | > 30% of units `unknown` in 24 h | 10 units | info | Store data quality |

M7 has no alert rule; it is shown on the dashboard only.

Alert delivery:
- **On the dashboard:** open alerts appear at the top of the status list ("الحالة") with severity ("تنبيه حرج" / "تحذير" / "للعلم"), message, value vs limit, sample size and start time. Alerts from a simulated fault are marked "(محاكاة عطل، لا يُرسل إشعار)".
- **In the console:** `/notifications` lists open alerts under "تنبيهات النظام", and the nav bell count includes them (with orders that need attention).
- **Optional webhook** (`ALERT_WEBHOOK_URL`, Discord/Slack): one POST when an alert opens, 3 s timeout. Skipped for alerts from a simulated fault.
- Resolve: an alert auto-resolves when the rule evaluates clean; `resolved_at` is set. An M6 alert caused by a simulated outage resolves on the first successful extraction after it.

## 4. Dashboard (`/monitoring`)

The page (nav label "الأداء") fetches `GET /api/monitoring/metrics?window=…` and refreshes every 15 s while the tab is visible (a hidden tab catches up when shown again). Aggregation is server-side, so the browser never receives keys or full tables. Sections:

- **Status list "الحالة":** open alerts, then one row per signal (Gemini reads M6, reading accuracy M1, speed M5, single-carton fit M4, validator M3, measurements M2) with the result in words, the limit and a verdict: "سليم", "فوق الحدّ" or "بيانات قليلة". Rows over the limit link to the page where the fix happens (for example `/catalog`).
- **Number tiles:** M1, M6, M5 (cached and with a new product) and M7 (per order, per 1000 orders, total for the window), each with its sample size and limit.
- **Cards:** "زمن تجهيز كل طلب" (M5 bar chart of the last 40 runs, cached vs new products, with the limit line), "من أين جاءت مقاسات القطع" (M2), "أسباب فشل قراءة المنتجات" (M6 by status), "نتيجة تجهيز الطلبات" (M4 outcomes, "طلبات تحتاج متابعة" with links to the orders, and "لماذا استُبعدت الكراتين" with skip reasons), "ترتيبات رفضها المدقّق" (M3) and "منتجات كانت معروفة مسبقاً" (cache-hit rate). Every chart has a table view.
- **Recent runs "آخر الطلبات المجهّزة":** the last 25 runs, with filters (الكل / لم تنتهِ بكرتون واحد / فيها منتج جديد / صحّح الموظف بياناتها). «التفاصيل» opens the run trace inline; on phones the table becomes cards.
- **Run trace** (`GET /api/runs/[runId]/trace`): the order run, each carton attempt, the extraction events (status, data source), packer corrections, timings, AI cost and a technical section (strategy, candidates checked, validator rejections, tokens, engine and prompt versions). This is the main investigation tool. `/monitoring?run=<uuid>` opens it directly; the result page links to it ("سجل هذا التجهيز في صفحة الأداء").

## 5. Fault injection (demo only)

To *demonstrate* that monitoring detects and helps investigate a problem, without waiting for a real outage:

- Open `/orders/<id>?outage=1`. The page sends `{ "simulateOutage": true }` with the pack request; the server honours it only when `DEMO_MODE=true`. There is no toggle in the UI.
- Effect: the extractor fails **before** calling Gemini, for **uncached** products only. (Cached products keep working, which is itself a point worth showing.)
- Events get `status` and `error_code` `simulated_outage`, so they are visibly distinguishable from real failures, and their alert sends no webhook.

## 6. Investigation story

The real story from development is the latency investigation (Vercel region `iad1` → `fra1`), told with its numbers in [docs/report/results.md](../report/results.md). Tell only stories that happened, with real numbers.

## 7. Supporting services

- **Vercel function logs** for raw errors and stack traces. `log()` in `lib/http.ts` writes one JSON line per API stage (`pack`, `action`, `facts`, `trace`, …) as `{"app":"rassah", "stage": …, "runId": …}`, so logs can be searched by `run_id`. The run trace does not link to them.
- **Supabase SQL editor** for ad-hoc investigation queries ([docs/queries.sql](../queries.sql)).

## 8. Tests

- `tests/monitoring/metrics.test.ts`: each metric computed from fixture event arrays, including the min-n case and the eval exclusion.
- `tests/monitoring/alerts.test.ts`: each rule fires above its threshold and not at it. Dedup and auto-resolve work.
- `tests/monitoring/dashboard.test.ts`: outcome counts, the follow-up order list and the limits sent to the page.
- `tests/pipeline/pack.test.ts`: an event write failure sets `monitoring.saved = false` and the pack still succeeds.

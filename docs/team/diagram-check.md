# Diagram check (aid for P11.5)

> For each box and arrow in `docs/diagrams.md`, the file and function that implements it. Every `file:line` below was opened and the named symbol found on that line (re-checked 2026-10-21); lines drift, so search for the symbol if the line is off. Goal: a teammate confirms the diagrams match the code in about 5 minutes. Tick the OK column only after you opened the file. "Process" rows describe how we work, not code: confirm them against `git log` and the CI run list instead.
>
> Names: the sequence diagram's `packOrder` is `lib/engine/index.ts`. It calls `packUnits` (which calls `validateLayout` on each candidate layout) and, when no single carton fits, `splitPack`.

## 1. Development Flow

| Box / arrow | Implemented by | OK? |
|---|---|---|
| Task from PLAN.md / CHECKLIST.md | `docs/PLAN.md:183` (`T5.`) Task tables with owner and done-when; progress in `docs/CHECKLIST.md`. | |
| Agents work in separate git worktrees | Process. Check `git worktree list` and `git log --graph`. | |
| Code + tests locally (`npm run dev` / `npm test`) | `package.json:14` (`"test"`)<br>`package.json:19` (`"check"`) | |
| Merge worktrees into main locally | Process (one integrator, stated under the dev-flow figure in `docs/diagrams.md`). Check `git log --merges`. | |
| Local CI gate: `agent-ship ci` | External tool outside the repo (`/Users/abdulaziz/bin/agent-ship`, exists on the integrator's machine). Not reproducible from a clone; run `agent-ship ci` to see the secret scan, floor guard, lint, typecheck, tests and build. | |
| fail arrow back to Code | Process (fix and re-run). | |
| Push to main | Process. See `git remote -v` and the commit list on GitHub. | |
| GitHub Actions CI: lint, typecheck, validate-data, vitest, build, eval:packing | `.github/workflows/ci.yml:18` (`npm run lint`)<br>`.github/workflows/ci.yml:19` (`npm run typecheck`)<br>`.github/workflows/ci.yml:20` (`npm run validate-data`)<br>`.github/workflows/ci.yml:21` (`npm test`)<br>`.github/workflows/ci.yml:23` (`npm run build`)<br>`.github/workflows/ci.yml:25` (`npm run eval:packing`) Step order in the file: lint, typecheck, validate-data, test, build, eval:packing. | |
| Vercel Production deployment from main | `vercel.json:3` (`fra1`) Deploys come from the Vercel project linked to the repo (dashboard). Only the region is configured in the repo. | |
| Smoke test: seeded orders | `scripts/demo-morning.ts:1` (`Demo-morning`) Plus the 20-order production smoke test recorded in `docs/demo-script.md`. | |
| Monitoring dashboard + alert rules | `app/(console)/monitoring/page.tsx:9` (`MonitoringPage`)<br>`lib/monitoring/alerts.ts:51` (`evaluateRules`) | |
| Investigate: events by run_id | `app/api/runs/[runId]/trace/route.ts:11` (`getRunTrace`)<br>`lib/db/supabase.ts:447` (`getRunTrace`) UI: «التفاصيل» on a row of «آخر الطلبات المجهّزة» on `/monitoring` opens the trace under the row. | |
| Open issue / task, back to Task | Process (CHECKLIST blockers log). | |
| Evaluation scripts: eval-extraction, eval-packing | `package.json:21` (`eval:extraction`)<br>`package.json:22` (`eval:packing`) | |
| eval_runs in Supabase | `scripts/eval-extraction.ts:82` (`eval_runs`)<br>`scripts/eval-packing.ts:196` (`eval_runs`) | |
| prompt or engine change (dotted arrow) to eval scripts | Process. Evidence: `docs/decisions.md` entries with before/after numbers. | |
| Evaluation page + report numbers | `app/(console)/evaluation/page.tsx:66` (`loadEval`)<br>`lib/monitoring/evaluation.ts:15` (`loadEval`) Report numbers: `docs/report/results.md`. | |

## 2a. Monitoring data flow

| Box / arrow | Implemented by | OK? |
|---|---|---|
| Packer: POST /api/orders/:id/pack | `app/api/orders/[id]/pack/route.ts:15` (`POST`)<br>`components/PackRunner.tsx:65` (`/pack`) | |
| Create run_id + start timer | `app/api/orders/[id]/pack/route.ts:31` (`randomUUID`)<br>`lib/pipeline/pack.ts:100` (`performance.now`) | |
| Product facts in catalog cache? (hit / miss) | `lib/ai/catalog.ts:55` (`getOrExtractFacts`)<br>`lib/ai/catalog.ts:69` (`isAuthoritative`) Hit = authoritative or fresh by source hash. | |
| Gemini extraction | `lib/ai/catalog.ts:77` (`extractFacts`)<br>`lib/ai/extractor.ts:136` (`extractFacts`)<br>`lib/ai/gemini.ts:21` (`generateContent`) Simulated-outage branch: `lib/ai/extractor.ts:148`. | |
| extraction_event per call | `lib/ai/catalog.ts:94` (`events.push`)<br>`lib/pipeline/pack.ts:319` (`insertExtractionEvents`)<br>`lib/db/supabase.ts:385` (`insertExtractionEvents`) | |
| product_facts | `lib/ai/catalog.ts:112` (`upsertFacts`)<br>`lib/db/supabase.ts:376` (`upsertFacts`) | |
| Packing engine (validator on every layout, split if no single carton fits) | `lib/pipeline/pack.ts:254` (`packOrder`)<br>`lib/engine/index.ts:20` (`packOrder`)<br>`lib/engine/packer.ts:419` (`packUnits`)<br>`lib/engine/packer.ts:450` (`validateLayout`)<br>`lib/engine/validator.ts:28` (`validateLayout`)<br>`lib/engine/index.ts:36` (`splitPack`) | |
| write order_run | `lib/pipeline/pack.ts:318` (`insertOrderRun`)<br>`lib/db/supabase.ts:390` (`insertOrderRun`) Violations copied at `lib/pipeline/pack.ts:272`. | |
| Result to packer | `lib/pipeline/pack.ts:99` (`runPack`) Returned as JSON by the route handler. | |
| Packer: Confirm / Edit / Measure | `components/PackRunner.tsx:116` (`confirm`)<br>`components/PackRunner.tsx:109` (`action`)<br>`components/PackRunner.tsx:110` (`/facts`, measurement) | |
| update order_run.employee_action + corrections rows | `app/api/runs/[runId]/action/route.ts:19` (`applyRunAction`)<br>`app/api/products/[id]/facts/route.ts:12` (`PATCH`)<br>`lib/pipeline/facts.ts:121` (`applyRunAction`)<br>`lib/db/supabase.ts:399` (`setOrderRunAction`)<br>`lib/db/supabase.ts:406` (`insertCorrections`) | |
| Tables extraction_events, order_runs, corrections, eval_runs, alerts | `lib/db/supabase.ts:385` (`insertExtractionEvents`)<br>`lib/db/supabase.ts:390` (`insertOrderRun`)<br>`lib/db/supabase.ts:406` (`insertCorrections`)<br>`lib/db/supabase.ts:466` (`insertAlert`)<br>`lib/db/supabase.ts:485` (`insertEvalRun`) Schema: `supabase/migrations/0001_init.sql`. | |
| Read rows, excluding trigger = 'eval' (window for the dashboard) | `lib/monitoring/metrics.ts:11` (`windowSince`)<br>`lib/monitoring/dashboard.ts:51` (`listExtractionEvents`)<br>`lib/monitoring/metrics.ts:55` (`trigger !== "eval"`) Three `list*` repo calls; the window is the `since` argument. | |
| M1 to M7 metric values + sample sizes | `lib/monitoring/metrics.ts:54` (`computeMetrics`)<br>`lib/monitoring/metrics.ts:81` (`m3`) M3 shown as an example. | |
| Alert rules: rolling last N + min sample; breach opens, clean resolves | `lib/monitoring/alerts.ts:29` (`THRESHOLDS`)<br>`lib/monitoring/alerts.ts:51` (`evaluateRules`)<br>`lib/monitoring/alerts.ts:193` (`syncAlerts`) Opened once per rule, auto-resolved (`resolveAlert`, `lib/db/supabase.ts:481`). | |
| Re-evaluated after each pack, each packer action and each dashboard load | `lib/pipeline/pack.ts:326` (`refreshAlerts`)<br>`app/api/runs/[runId]/action/route.ts:21` (`refreshAlerts`)<br>`lib/monitoring/dashboard.ts:58` (`refreshAlerts`) | |
| /monitoring dashboard | `app/(console)/monitoring/page.tsx:9` (`MonitoringPage`)<br>`app/api/monitoring/metrics/route.ts:7` (`GET`)<br>`components/MonitoringDashboard.tsx:75` (`/api/monitoring/metrics`) | |
| Status list on /monitoring, /notifications, nav bell | `components/MonitoringDashboard.tsx:309` (`Health`)<br>`components/MonitoringDashboard.tsx:370` (`Alerts`)<br>`app/(console)/notifications/page.tsx:63` (`تنبيهات النظام`)<br>`components/ConsoleNav.tsx:91` (`alertsOpen`) | |
| optional webhook (never for simulated) | `lib/monitoring/alerts.ts:225` (`!ev.simulated`) | |
| /evaluation page | `app/(console)/evaluation/page.tsx:48` (`EvaluationPage`)<br>`lib/monitoring/evaluation.ts:15` (`loadEval`) | |

## 2b. Sequence for one order (uncached product)

| Box / arrow | Implemented by | OK? |
|---|---|---|
| 1-2 Packer opens order; UI posts pack | `components/OrderLookup.tsx:23` (`router.push`)<br>`app/(console)/orders/[id]/page.tsx:44` (`PackRunner`)<br>`components/PackRunner.tsx:65` (`/pack`) | |
| 3-4 Load order, products, cartons, cached product_facts; 2 cached, 1 missing | `lib/pipeline/pack.ts:201` (`getOrExtractFacts`)<br>`lib/db/supabase.ts:302` (`getOrder`)<br>`lib/db/supabase.ts:366` (`getFacts`) | |
| 5-6 generateContent(product text, JSON schema); JSON facts + usage tokens | `lib/ai/gemini.ts:21` (`generateContent`)<br>`lib/ai/gemini.ts:28` (`responseSchema`)<br>`lib/ai/schema.ts:28` (`GEMINI_RESPONSE_SCHEMA`) | |
| 7 upsert product_facts | `lib/ai/catalog.ts:112` (`upsertFacts`) | |
| 8-10 packOrder; search and validate every layout; cheapest valid carton, split or no_box | `lib/engine/index.ts:20` (`packOrder`)<br>`lib/engine/packer.ts:419` (`packUnits`)<br>`lib/engine/packer.ts:450` (`validateLayout`)<br>`lib/engine/index.ts:36` (`splitPack`) | |
| 11 insert order_run + extraction_events | `lib/pipeline/pack.ts:318` (`insertOrderRun`)<br>`lib/pipeline/pack.ts:319` (`insertExtractionEvents`) | |
| 12 re-evaluate alert rules | `lib/pipeline/pack.ts:326` (`refreshAlerts`) | |
| 13 carton + instructions + layout + run_id back to UI | `lib/pipeline/pack.ts:99` (`runPack`)<br>`lib/engine/instructions.ts:14` (`buildInstructions`) | |
| 14-16 Confirm or Edit; POST /api/runs/:runId/action; update order_run, insert corrections, re-evaluate alerts | `components/PackRunner.tsx:116` (`confirm`)<br>`app/api/runs/[runId]/action/route.ts:7` (`POST`)<br>`lib/pipeline/facts.ts:121` (`applyRunAction`)<br>`app/api/runs/[runId]/action/route.ts:21` (`refreshAlerts`) | |

## 3. System architecture

| Box / arrow | Implemented by | OK? |
|---|---|---|
| Browser pages: Landing, Orders queue, Result + 3D view, Notifications, Catalog, Monitoring, Evaluation, Store | `app/page.tsx:47` (`LandingPage`)<br>`app/(console)/orders/page.tsx:16` (`OrdersPage`)<br>`app/(console)/orders/[id]/page.tsx:16` (`OrderResultPage`)<br>`components/PackingView3D.tsx:24` (`PackingView3D`)<br>`app/(console)/catalog/page.tsx:11` (`CatalogPage`)<br>`app/(console)/monitoring/page.tsx:9` (`MonitoringPage`)<br>`app/(console)/evaluation/page.tsx:48` (`EvaluationPage`)<br>`app/(console)/notifications/page.tsx:15` (`NotificationsPage`)<br>`app/store/page.tsx:8` (`StorePage`) | |
| Route handlers /api/* | `app/api/orders/[id]/pack/route.ts:15` (`POST`)<br>`app/api/runs/[runId]/action/route.ts:7` (`POST`)<br>`app/api/runs/[runId]/trace/route.ts:11` (`getRunTrace`)<br>`app/api/monitoring/metrics/route.ts:7` (`GET`)<br>`app/api/products/[id]/extract/route.ts:10` (`POST`)<br>`app/api/products/[id]/facts/route.ts:12` (`PATCH`)<br>`app/api/orders/queue/route.ts:6` (`GET`)<br>`app/api/store/checkout/route.ts:8` (`POST`) Also `app/api/health/route.ts`. | |
| lib/pipeline: pack orchestration, corrections | `lib/pipeline/pack.ts:99` (`runPack`)<br>`lib/pipeline/facts.ts:42` (`updateProductFacts`) | |
| lib/ai: extractor, prompt, schema, catalog cache | `lib/ai/catalog.ts:55` (`getOrExtractFacts`)<br>`lib/ai/extractor.ts:136` (`extractFacts`)<br>`lib/ai/prompt.ts:35` (`buildUserPrompt`)<br>`lib/ai/schema.ts:28` (`GEMINI_RESPONSE_SCHEMA`) | |
| lib/engine: packer, validator, split, cost, instructions | `lib/engine/packer.ts:419` (`packUnits`)<br>`lib/engine/split.ts:33` (`splitPack`)<br>`lib/engine/validator.ts:28` (`validateLayout`)<br>`lib/engine/cost.ts:9` (`estimateCost`)<br>`lib/engine/instructions.ts:14` (`buildInstructions`) `lib/engine/baseline.ts` (naive baseline) is used only by the eval. | |
| lib/monitoring: metrics, alerts, dashboard, evaluation | `lib/monitoring/metrics.ts:54` (`computeMetrics`)<br>`lib/monitoring/alerts.ts:51` (`evaluateRules`)<br>`lib/monitoring/dashboard.ts:48` (`loadDashboard`)<br>`lib/monitoring/evaluation.ts:15` (`loadEval`) Events are written by the pipeline (`lib/pipeline/pack.ts:318-319`); there is no events file in `lib/monitoring`. | |
| lib/orders: queue, notifications | `lib/orders/load.ts:16` (`loadQueue`)<br>`lib/orders/queue.ts:50` (`buildQueue`) | |
| lib/integrations + External store API (optional, read-only) | `lib/integrations/store.ts:23` (`makeStoreOrderFetcher`)<br>`app/api/orders/[id]/pack/route.ts:6` (`storeIntegrationConfig`)<br>`lib/pipeline/pack.ts:161` (`externalOrders`) | |
| lib/db: Repo, Supabase adapter or memory backend | `lib/db/supabase.ts:270` (`constructor`)<br>`lib/db/repo.ts:21` (`Repo`)<br>`lib/db/memory.ts` (offline backend) | |
| Gemini API | `lib/ai/gemini.ts:21` (`generateContent`) | |
| Supabase Postgres | `lib/db/supabase.ts:272` (`ping`) Schema: `supabase/migrations/0001_init.sql`. | |
| scripts/eval-* + lib/eval scoring | `scripts/eval-extraction.ts:82` (`eval_runs`)<br>`scripts/eval-packing.ts:196` (`eval_runs`)<br>`lib/eval/extraction-score.ts:22` (`score`) Arrows EVS to AI, EN, DBL: the scripts import `lib/ai` and `lib/engine` and write to Supabase directly. | |

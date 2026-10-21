# Diagram check (aid for P11.5)

> For each box and arrow in `docs/diagrams.md`, the file and function that implements it. Every `file:line` below was opened and the named symbol found at (or within 3 lines of) that line when this file was written; lines drift, so search for the symbol if the line is off. Goal: a teammate confirms the diagrams match the code in about 5 minutes. Tick the OK column only after you opened the file. "Process" rows describe how we work, not code: confirm them against `git log` and the CI run list instead.
>
> Name differences: the sequence diagram says "pack(items, cartons)" and "validate(layout)". The code calls `packOrder` (`lib/engine/index.ts`), which calls `packUnits`, which calls `validateLayout` on each candidate layout.

## 1. Development Flow

| Box / arrow | Implemented by | OK? |
|---|---|---|
| Task from PLAN.md / CHECKLIST.md | `docs/PLAN.md:186` (`T5.`) Task tables with owner and done-when; progress in `docs/CHECKLIST.md`. | |
| Agents work in separate git worktrees | Process. Check `git worktree list` and `git log --graph`. | |
| Code + tests locally (`npm run dev` / `npm test`) | `package.json:14` (`"test"`)<br>`package.json:19` (`"check"`) | |
| Merge worktrees into main locally | Process (one integrator, stated under the dev-flow figure in `docs/diagrams.md`). Check `git log --merges`. | |
| Local CI gate: `agent-ship ci` | External tool outside the repo (`/Users/abdulaziz/bin/agent-ship`, exists on the integrator's machine). Not reproducible from a clone; run `agent-ship ci` to see the secret scan, floor guard, lint, typecheck, tests and build. | |
| fail arrow back to Code | Process (fix and re-run). | |
| Push to main | Process. See `git remote -v` and the commit list on GitHub. | |
| GitHub Actions CI: lint, typecheck, validate-data, vitest, build, eval:packing | `.github/workflows/ci.yml:18` (`npm run lint`)<br>`.github/workflows/ci.yml:19` (`npm run typecheck`)<br>`.github/workflows/ci.yml:20` (`npm run validate-data`)<br>`.github/workflows/ci.yml:21` (`npm test`)<br>`.github/workflows/ci.yml:23` (`npm run build`)<br>`.github/workflows/ci.yml:25` (`npm run eval:packing`) Step order in the file: lint, typecheck, validate-data, test, build, eval:packing. | |
| Vercel Production deployment from main | `vercel.json:3` (`fra1`) Deploys come from the Vercel project linked to the repo (dashboard). Only the region is configured in the repo. | |
| Smoke test: seeded orders | `scripts/demo-morning.ts:1` (`Demo-morning`) Plus the 20-order production smoke test recorded in `docs/demo-script.md`. | |
| Monitoring dashboard + alert rules | `app/monitoring/page.tsx:7` (`MonitoringPage`)<br>`lib/monitoring/alerts.ts:50` (`evaluateRules`) | |
| Investigate: events by run_id | `app/api/runs/[runId]/trace/route.ts:10` (`getRunTrace`)<br>`lib/db/supabase.ts:377` (`getRunTrace`) UI: click a run in the dashboard. | |
| Open issue / task, back to Task | Process (CHECKLIST blockers log). | |
| Evaluation scripts: eval-extraction, eval-packing | `package.json:21` (`eval:extraction`)<br>`package.json:22` (`eval:packing`) | |
| eval_runs in Supabase | `scripts/eval-extraction.ts:82` (`eval_runs`)<br>`scripts/eval-packing.ts:196` (`eval_runs`) | |
| prompt or engine change (dotted arrow) to eval scripts | Process. Evidence: `docs/decisions.md` entries with before/after numbers. | |
| Evaluation page + report numbers | `app/evaluation/page.tsx:68` (`loadEval`)<br>`lib/monitoring/evaluation.ts:15` (`loadEval`) Report numbers: `docs/report/results.md`. | |

## 2a. Monitoring data flow

| Box / arrow | Implemented by | OK? |
|---|---|---|
| Packer: POST /api/orders/:id/pack | `app/api/orders/[id]/pack/route.ts:12` (`POST`)<br>`components/PackRunner.tsx:36` (`/pack`) | |
| Create run_id + start timer | `app/api/orders/[id]/pack/route.ts:30` (`randomUUID`)<br>`lib/pipeline/pack.ts:71` (`performance.now`) | |
| Product facts in catalog cache? (hit / miss) | `lib/ai/catalog.ts:55` (`getOrExtractFacts`)<br>`lib/ai/catalog.ts:68` (`isAuthoritative`) Hit = authoritative or fresh by source hash. | |
| Gemini extraction | `lib/ai/catalog.ts:76` (`extractFacts`)<br>`lib/ai/extractor.ts:136` (`extractFacts`)<br>`lib/ai/gemini.ts:21` (`generateContent`) Simulated-outage branch: `lib/ai/extractor.ts:148`. | |
| write extraction_event | `lib/ai/catalog.ts:82` (`events.push`)<br>`lib/pipeline/pack.ts:243` (`insertExtractionEvents`)<br>`lib/db/supabase.ts:321` (`insertExtractionEvents`) | |
| product_facts | `lib/ai/catalog.ts:95` (`upsertFacts`)<br>`lib/db/supabase.ts:312` (`upsertFacts`) | |
| Packing engine | `lib/pipeline/pack.ts:165` (`packOrder`)<br>`lib/engine/index.ts:24` (`packOrder`)<br>`lib/engine/packer.ts:416` (`packUnits`) | |
| Independent validator | `lib/engine/packer.ts:447` (`validateLayout`)<br>`lib/engine/validator.ts:28` (`validateLayout`) Gate on every candidate layout. | |
| write order_run | `lib/pipeline/pack.ts:242` (`insertOrderRun`)<br>`lib/db/supabase.ts:326` (`insertOrderRun`) Violations copied at `lib/pipeline/pack.ts:183`. | |
| Result to packer | `lib/pipeline/pack.ts:70` (`runPack`) Returned as JSON by the route handler. | |
| Packer: Confirm / Edit | `components/PackRunner.tsx:85` (`confirm`)<br>`components/PackRunner.tsx:77` (`action`) | |
| update order_run.employee_action + corrections rows | `app/api/runs/[runId]/action/route.ts:21` (`applyRunAction`)<br>`lib/pipeline/facts.ts:115` (`applyRunAction`)<br>`lib/db/supabase.ts:335` (`setOrderRunAction`)<br>`lib/db/supabase.ts:342` (`insertCorrections`) | |
| Tables extraction_events, order_runs, corrections, eval_runs, alerts | `lib/db/supabase.ts:321` (`insertExtractionEvents`)<br>`lib/db/supabase.ts:326` (`insertOrderRun`)<br>`lib/db/supabase.ts:342` (`insertCorrections`)<br>`lib/db/supabase.ts:396` (`insertAlert`)<br>`lib/db/supabase.ts:415` (`insertEvalRun`) Schema: `supabase/migrations/0001_init.sql`. | |
| SQL queries over a time window, excluding trigger = 'eval' | `lib/monitoring/metrics.ts:11` (`windowSince`)<br>`lib/monitoring/dashboard.ts:24` (`listExtractionEvents`)<br>`lib/monitoring/metrics.ts:55` (`trigger !== "eval"`) Three `list*` repo calls; the window is the `since` argument. | |
| M1 to M7 metric values + sample sizes | `lib/monitoring/metrics.ts:54` (`computeMetrics`)<br>`lib/monitoring/metrics.ts:81` (`m3`) M3 shown as an example. | |
| Alert rules: threshold + min sample; breach writes alerts | `lib/monitoring/alerts.ts:28` (`THRESHOLDS`)<br>`lib/monitoring/alerts.ts:50` (`evaluateRules`)<br>`lib/monitoring/alerts.ts:177` (`syncAlerts`) Opened once per rule, auto-resolved (`resolveAlert`, `lib/db/supabase.ts:411`). | |
| Recomputed on dashboard load and after each run | `lib/monitoring/dashboard.ts:31` (`refreshAlerts`)<br>`lib/pipeline/pack.ts:250` (`refreshAlerts`) | |
| /monitoring dashboard | `app/monitoring/page.tsx:7` (`MonitoringPage`)<br>`app/api/monitoring/metrics/route.ts:7` (`GET`)<br>`components/MonitoringDashboard.tsx:56` (`/api/monitoring/metrics`) | |
| Alert banner on dashboard | `components/MonitoringDashboard.tsx:302` (`Alerts`) | |
| optional webhook (never for simulated) | `lib/monitoring/alerts.ts:195` (`!ev.simulated`) | |
| /evaluation page | `app/evaluation/page.tsx:46` (`EvaluationPage`)<br>`lib/monitoring/evaluation.ts:15` (`loadEval`) | |

## 2b. Sequence for one order (uncached product)

| Box / arrow | Implemented by | OK? |
|---|---|---|
| 1-2 Packer enters order; UI posts pack | `components/OrderLookup.tsx:19` (`router.push`)<br>`app/orders/[id]/page.tsx:42` (`PackRunner`)<br>`components/PackRunner.tsx:36` (`/pack`) | |
| 3-4 Load order items + cached product_facts; 2 cached, 1 missing | `lib/pipeline/pack.ts:143` (`getOrExtractFacts`)<br>`lib/db/supabase.ts:264` (`getOrder`)<br>`lib/db/supabase.ts:302` (`getFacts`) | |
| 5-6 generateContent(product text, JSON schema); JSON facts + usage tokens | `lib/ai/gemini.ts:21` (`generateContent`)<br>`lib/ai/gemini.ts:28` (`responseSchema`)<br>`lib/ai/schema.ts:28` (`GEMINI_RESPONSE_SCHEMA`) | |
| 7 insert extraction_event, upsert product_facts | `lib/ai/catalog.ts:95` (`upsertFacts`)<br>`lib/pipeline/pack.ts:243` (`insertExtractionEvents`) Order differs slightly from the diagram: facts are upserted during extraction, and events are inserted after packing together with the order run (`pack.ts:242-243`). | |
| 8-9 pack(items, cartons); best layout per carton | `lib/engine/index.ts:24` (`packOrder`)<br>`lib/engine/packer.ts:416` (`packUnits`) | |
| 10-11 validate(layout); valid / violations | `lib/engine/packer.ts:447` (`validateLayout`)<br>`lib/engine/validator.ts:28` (`validateLayout`) | |
| 12 insert order_run (timings, status, violations, cost) | `lib/pipeline/pack.ts:242` (`insertOrderRun`) | |
| 13 carton + instructions + layout + run_id back to UI | `lib/pipeline/pack.ts:70` (`runPack`)<br>`lib/engine/instructions.ts:14` (`buildInstructions`) | |
| 14-16 Confirm or Edit; POST /api/runs/:runId/action; update order_run, insert corrections | `components/PackRunner.tsx:85` (`confirm`)<br>`app/api/runs/[runId]/action/route.ts:9` (`POST`)<br>`lib/pipeline/facts.ts:115` (`applyRunAction`) | |

## 3. System architecture

| Box / arrow | Implemented by | OK? |
|---|---|---|
| Browser pages: Order, Result + 3D view, Catalog, Monitoring, Evaluation | `app/orders/page.tsx:17` (`OrdersPage`)<br>`app/orders/[id]/page.tsx:16` (`OrderResultPage`)<br>`components/PackingView3D.tsx:23` (`PackingView3D`)<br>`app/catalog/page.tsx:10` (`CatalogPage`)<br>`app/monitoring/page.tsx:7` (`MonitoringPage`)<br>`app/evaluation/page.tsx:46` (`EvaluationPage`) | |
| Route handlers /api/* | `app/api/orders/[id]/pack/route.ts:12` (`POST`)<br>`app/api/runs/[runId]/action/route.ts:9` (`POST`)<br>`app/api/runs/[runId]/trace/route.ts:10` (`getRunTrace`)<br>`app/api/monitoring/metrics/route.ts:7` (`GET`)<br>`app/api/products/[id]/extract/route.ts:10` (`POST`)<br>`app/api/products/[id]/facts/route.ts:11` (`PATCH`) Also `app/api/health/route.ts`. | |
| lib/pipeline: pack orchestration, facts cache | `lib/pipeline/pack.ts:70` (`runPack`)<br>`lib/pipeline/facts.ts:42` (`updateProductFacts`) | |
| lib/ai: extractor, prompt, schema | `lib/ai/extractor.ts:136` (`extractFacts`)<br>`lib/ai/prompt.ts:35` (`buildUserPrompt`)<br>`lib/ai/schema.ts:28` (`GEMINI_RESPONSE_SCHEMA`) | |
| lib/engine: packer, validator, cost, instructions | `lib/engine/packer.ts:416` (`packUnits`)<br>`lib/engine/validator.ts:28` (`validateLayout`)<br>`lib/engine/cost.ts:9` (`estimateCost`)<br>`lib/engine/instructions.ts:14` (`buildInstructions`) `lib/engine/baseline.ts` (naive baseline) is used only by the eval. | |
| lib/monitoring: events, metrics, alerts | `lib/monitoring/metrics.ts:54` (`computeMetrics`)<br>`lib/monitoring/alerts.ts:50` (`evaluateRules`)<br>`lib/monitoring/dashboard.ts:21` (`loadDashboard`) Events are written by the pipeline (`lib/pipeline/pack.ts:242-243`); there is no events file in `lib/monitoring`. | |
| lib/db: Supabase server client | `lib/db/supabase.ts:244` (`constructor`)<br>`lib/db/repo.ts:21` (`Repo`) Offline backend: `lib/db/memory.ts`. | |
| Gemini API | `lib/ai/gemini.ts:21` (`generateContent`) | |
| Supabase Postgres | `lib/db/supabase.ts:246` (`ping`) Schema: `supabase/migrations/0001_init.sql`. | |
| scripts/eval-* + lib/eval scoring | `scripts/eval-extraction.ts:82` (`eval_runs`)<br>`scripts/eval-packing.ts:196` (`eval_runs`)<br>`lib/eval/extraction-score.ts:22` (`score`) Arrows EVS to AI, EN, DBL: the scripts import `lib/ai` and `lib/engine` and write to Supabase directly. | |

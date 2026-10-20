# Decision Log

One line per decision: date, decision, reason, alternatives considered. The brief asks us to justify technical and tool choices, and this file is the evidence.

| Date | Decision | Reason | Alternatives considered |
|---|---|---|---|
| 2026-10-20 | **Using external AI APIs (Gemini) satisfies the "AI-powered product" requirement. No fine-tuning or model training is required.** | Confirmed by the instructor (CHECKLIST P0.1). | Training or fine-tuning a model, which was ruled out as unnecessary. |
| 2026-10-20 | Deploy on Vercel with a full Next.js + TypeScript stack | Team decision. Vercel previews per PR strengthen the dev-environment story. | Streamlit on Streamlit Cloud (can't run on Vercel), Next.js + Python functions |
| 2026-10-20 | Supabase (Postgres) for the catalog cache, events and eval results | Vercel functions are stateless, so a local SQLite file would not persist | SQLite |
| 2026-10-20 | Gemini (Flash tier, model id in `GEMINI_MODEL`) as the LLM | Team has access to Gemini. Fast and cheap for short extraction. | Claude, GPT |
| 2026-10-20 | Synthetic product dataset, stated openly in the report | No access to a real merchant catalog within 2 days | Real store pages (time), physically measured products |
| 2026-10-20 | Next.js 16.4 (create-next-app default) with Cache Components on. No `runtime`/`dynamic` route exports. Per-request work uses `connection()` + `<Suspense>`. | Current default and recommended model. Vercel-native. | Turning Cache Components off (previous caching model) |
| 2026-10-20 | Node.js 24 LTS (`.nvmrc`, `engines`), `@types/node` 24 | Active LTS. Vitest 5 requires `@types/node` ≥ 22. | Node 22 |
| 2026-10-20 | Exact dependency versions pinned in `package.json` | Same build locally, in CI and on Vercel | Caret ranges |
| 2026-10-20 | npm install scripts for `protobufjs` and `unrs-resolver` left un-approved (npm 11 blocks them by default) | Lint, typecheck, tests and build all pass without them. Fewer third-party scripts run. | Approving them with `npm install-scripts approve` |

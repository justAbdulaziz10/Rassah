# Rassah (رصّة)

**AI packing assistant for Saudi e-commerce merchants.**

A packer types an order number. Rassah reads each product's page with an LLM (Gemini), extracts dimensions and weight, and flags whether the product is fragile, liquid or sensitive. A constrained 3D packing engine then picks the cheapest carton that holds the order safely. The packer gets the carton, step-by-step packing instructions and a 3D view of the layout. Every step is logged to Supabase and shown on a monitoring dashboard.

> Status: **planning**. The implementation follows [`docs/PLAN.md`](docs/PLAN.md).
> Built for *Project 1: AI Product Development and Monitoring* (Tuwaiq Academy × Startupbootcamp × Meta). Demo day: **Thursday 22 October 2026**.

## Getting started

**Prerequisites:** Node.js 24 LTS (see `.nvmrc`), npm, Git.

```bash
git clone https://github.com/justAbdulaziz10/Rassah.git
cd Rassah
npm ci
cp .env.example .env.local     # then fill in the values (see docs/CHECKLIST.md, credentials register)
npm run check                  # lint + typecheck + unit tests
npm run dev                    # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run check` | Lint + typecheck + tests. Run before every push. |
| `npm test` | Unit tests (Vitest, no network) |
| `npm run validate-data` | Validates the synthetic dataset in `data/` |
| `npm run seed` | Loads the mock store into Supabase (needs `.env.local`) |
| `npm run eval:packing` | Packing evaluation (engine vs naive baseline, no network) |
| `npm run eval:extraction` | Extraction evaluation against ground truth (calls Gemini, costs tokens) |

`GET /api/health` reports whether the Gemini key and the database are available. It never returns secret values.

**No Supabase yet?** Put `DATA_BACKEND=memory` (and `DEMO_MODE=true`) in `.env.local`. The app then runs on the mock store from `data/*.json` held in memory. This is local only, ignored on Vercel, and also the offline fallback for demo day. Without a Gemini key, products are reported as "needs measurement" (never guessed), and you can enter measurements manually.

> Next.js 16 with Cache Components is used. Read `AGENTS.md` and the docs in `node_modules/next/dist/docs/` before writing pages or routes. Several APIs differ from older Next.js versions.

## Documentation

| Document | What it covers |
|---|---|
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | **Single source of truth for progress**: 517 tasks in 13 phases, gates, credentials register, env matrix, blockers log |
| [docs/PLAN.md](docs/PLAN.md) | Master plan: problem, MVP scope, architecture, timeline, team ownership, deliverables, risks |
| [docs/diagrams.md](docs/diagrams.md) | Required diagrams: development flow and monitoring flow, plus the system architecture |
| [docs/stack/01-nextjs-typescript.md](docs/stack/01-nextjs-typescript.md) | Next.js app: routes, pages, API handlers, folder layout, UI and RTL |
| [docs/stack/02-gemini-extraction.md](docs/stack/02-gemini-extraction.md) | Gemini API: extraction prompt, JSON schema, fallback chain, confidence, caching, errors |
| [docs/stack/03-packing-engine.md](docs/stack/03-packing-engine.md) | Packing engine, independent validator, cost model, packing instructions |
| [docs/stack/04-supabase.md](docs/stack/04-supabase.md) | Database schema, migrations, access rules, seed data |
| [docs/stack/05-3d-visualization.md](docs/stack/05-3d-visualization.md) | 3D layout view with react-three-fiber |
| [docs/stack/06-monitoring.md](docs/stack/06-monitoring.md) | Events, the seven metrics, alert rules, dashboard, fault injection |
| [docs/stack/07-evaluation.md](docs/stack/07-evaluation.md) | Offline evaluation: datasets, metrics, scripts, how results reach the report |
| [docs/stack/08-testing-quality.md](docs/stack/08-testing-quality.md) | Vitest, ESLint, TypeScript strict mode, the test list |
| [docs/stack/09-vercel-ci.md](docs/stack/09-vercel-ci.md) | Vercel deployment, environment variables, GitHub Actions CI, branch workflow |

## Tech stack at a glance

| Layer | Choice |
|---|---|
| App framework | Next.js (App Router) + TypeScript (strict) |
| UI | Tailwind CSS, Arabic RTL layout |
| AI | Google Gemini API via `@google/genai` (Flash-tier model, configurable) |
| Packing engine | Team-written TypeScript (extreme-point search + independent validator) |
| Database and event store | Supabase (Postgres) via `@supabase/supabase-js` |
| 3D view | `@react-three/fiber` + `@react-three/drei` |
| Charts | Recharts |
| Tests and quality | Vitest, ESLint, `tsc --noEmit` |
| Hosting and CI | Vercel (preview per PR, production on `main`), GitHub Actions |

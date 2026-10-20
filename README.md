# Rassah (رصّة)

**AI packing assistant for Saudi e-commerce merchants.**

A packer types an order number. Rassah reads each product's page with an LLM (Gemini), extracts dimensions and weight, and flags whether the product is fragile, liquid or sensitive. A constrained 3D packing engine then picks the cheapest carton that holds the order safely. The packer gets the carton, step-by-step packing instructions and a 3D view of the layout. Every step is logged to Supabase and shown on a monitoring dashboard.

> Status: **planning**. The implementation follows [`docs/PLAN.md`](docs/PLAN.md).
> Built for *Project 1: AI Product Development and Monitoring* (Tuwaiq Academy × Startupbootcamp × Meta). Demo day: **Thursday 22 October 2026**.

## Documentation

| Document | What it covers |
|---|---|
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

# Tools & AI Usage Log

The brief asks for: which tools we used, what each did, why we chose it over alternatives, which parts were generated / assisted / written manually, and how we verified the output. **Every team member must be able to explain this table.**

## AI tools

| Tool | Used for | Why this tool | Generated / assisted / manual | How we verified it | Limitations / trade-offs |
|---|---|---|---|---|---|
| **Gemini API** (Flash-tier, `@google/genai` 2.30) | **Runtime product feature**: reads each product page and returns outer-package dimensions, weight, fragile/liquid/sensitive flags, the source of each value, confidence, and evidence | Team has access. Flash tier is fast and cheap for short structured extraction. Strong Arabic and mixed-unit understanding. | Product feature (our prompt + schema, see `lib/ai/`) | Extraction eval against hand-labeled ground truth (dims ±1 cm, weight ±10%, inferred MAPE, honesty, fragile recall). Zod validation + sanity rules on every response. | Can misread or guess. Mitigated by source tags, never-invent rule, safety margin on inferred values, packer confirmation, and the M1/M6 metrics. Synthetic data only. |
| **Claude (Claude Code)** | Idea critique and planning, `docs/` drafts, project scaffold, engine/validator/extractor/pipeline/UI code drafts, tests, eval scripts | Agentic coding assistant with repository access. Fast iteration with tests. | **Generated**, then reviewed by the team (review owners in PLAN §10) | `npm run check` (lint, typecheck, data validation, 219 unit/property/pipeline tests), GitHub Actions CI on every push, production build, end-to-end API run, screenshots of the running app, packing eval | Generated code must be understood by every member (Q&A drill, CHECKLIST P11.44–P11.49). Synthetic ground truth was drafted by the same tool that wrote the descriptions, so **M2 must review it independently** (CHECKLIST P3.12). |
| Google AI Studio | Creating the Gemini key, trying prompts by hand | Official console for the Gemini API | Manual | n/a | Free-tier rate limits decide our concurrency (2) and the eval delay |

## Development tools

| Tool | Used for | Why over alternatives |
|---|---|---|
| Next.js 16 (App Router, Cache Components) + TypeScript strict | UI + API in one deployable project | Vercel-native, one language. Streamlit cannot run on Vercel. |
| Tailwind CSS 4 | RTL-friendly styling with logical utilities | Fast, consistent tokens for light/dark |
| Supabase (Postgres) | Mock store, AI catalog cache, monitoring events, eval results | Serverless functions have no durable disk, so SQLite would lose data |
| Vercel | Hosting, production deploy from `main` | Team decision. Per-PR previews were planned but not used (one preview check on 2026-10-21); see `docs/decisions.md`. |
| GitHub + GitHub Actions | Version control, CI (lint, typecheck, data validation, tests, build, packing eval) | Required handoff. Free CI for public repos. |
| Vitest | Unit, property and pipeline tests | Fast, native TS/ESM |
| Zod 4 | Validating env vars, API input, data files, model output | One schema library for every trust boundary |
| react-three-fiber + drei | 3D layout view | Lightweight, React-native box meshes |
| Recharts | Dashboard charts | React components. Palette validated for color-vision deficiency in both themes. |
| tsx | Running TS scripts (seed, evals, benchmark, fixture generator, demo-morning check) | No build step for scripts |

## Which parts were written how

| Part | Origin | Owner who must explain it |
|---|---|---|
| Problem framing, idea pivots (lost-and-found → Rassah), scope decisions | Team, with AI critique | ALL |
| `lib/engine/*` (prepare, packer, split, validator, cost, instructions, baseline) | AI-generated, team-reviewed, then improved through evaluation (recall 3/20 → 20/20) | M2 (reviewer M1) |
| `lib/ai/*` (prompt, schema, extractor, Gemini adapter, catalog cache) | AI-generated, team-reviewed | M1 (reviewer M3) |
| `lib/db/*`, migration, scripts | AI-generated, team-reviewed | M3 (reviewer M2) |
| `lib/monitoring/*`, dashboard | AI-generated, team-reviewed | M3 (reviewer M1) |
| `data/*.json` (synthetic products, ground truth, orders, cartons) | AI-generated synthetic data. **Ground truth needs independent review by M2.** | M1 + M2 |
| Evaluation design and interpretation | Team + AI | M1 + M2 |

## Verification steps we can show

1. `npm run check` → lint, typecheck, `validate-data`, 219 tests (incl. a 200-order property test: every layout passes the independent validator).
2. CI green on every commit (GitHub Actions).
3. `npm run eval:packing` → `eval/results/packing-*.json` (validity 40/40, 0 false claims, recall 20/20, baseline failing 20/28).
4. `npm run eval:extraction` → `eval/results/extraction-2026-10-21-v1.json` (30/30 calls ok, `gemini-3.5-flash-lite`).
5. A probe with a fake Gemini key confirmed the request shape and the error mapping (`400 API key not valid` → `config_error`).

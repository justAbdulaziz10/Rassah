# Rassah: Master Plan

> Owner: the whole team (3 members). Last updated: 20 Oct 2026. Demo: Thu 22 Oct 2026 (3-minute pitch + 10-minute Q&A).
> Every member must be able to explain **every** section of this plan, not only their own part. Judges may ask any member about any component.
> **Progress is tracked only in [CHECKLIST.md](CHECKLIST.md).** This plan explains the what and why. The checklist tracks what is done.

---

## 1. Problem

Merchants who ship multi-item orders pick a carton by eye. Three things go wrong:

1. **Oversized cartons.** Couriers bill by *chargeable weight* = `max(actual weight, volumetric weight)`, where volumetric weight = `L × W × H / divisor` (commonly 5000 cm³/kg). An oversized carton raises the shipping bill even when the products are light.
2. **Broken items and returns.** A new packer puts a book on top of a perfume bottle, or lays an oil bottle on its side.
3. **Missing product data.** Professional cartonization tools (e.g. Paccurate) assume clean product dimensions already exist in a warehouse system. Small Saudi merchants don't have that data. It lives as free text on their product pages, in Arabic and English, in many formats ("٣٠×٢٠×١٠ سم", "12 x 8 x 4 in", "100 مل").

**What we don't know yet:** we have no merchant interviews. The size of the problem is a *hypothesis*. Before demo day, at least one team member messages 2–3 Salla/Zid merchants (see §11, task T0) and asks how they pick cartons today. Any reply goes in the pitch. If nobody replies, we say so honestly.

## 2. Solution in one sentence

> The packer types an order number. Rassah uses Gemini to read every product's page, extract dimensions and weight, and flag fragile, liquid and sensitive items. A constrained 3D packing engine picks the cheapest safe carton and produces packing instructions and a 3D layout. Every step is monitored.

### Where the AI is, and why it is AI

| Step | Tool | Why this tool |
|---|---|---|
| Understand messy product text (Arabic/English, mixed units, Arabic-Indic digits, missing data) and classify handling needs (fragile / liquid / sensitive) | **Gemini (LLM)** | Rules (`if/else`, regex) break on free-form text. "كريستال" means *fragile* without the word "fragile" appearing. |
| Place items in a carton without overlap, with gravity and handling rules | **Search-based packing engine** (classical AI search) | An LLM cannot *guarantee* collision-free coordinates. Geometry needs exact computation. |
| Prove the layout is physically valid | **Independent validator** (plain math) | Correctness must be checked by code that shares no logic with the engine. |

**Line for the judges:** *"The LLM understands, the engine computes, the validator proves."*

> **Confirmed (20 Oct):** the instructor confirmed that using AI APIs satisfies the requirement and that no fine-tuning is needed. See [decisions.md](decisions.md).

## 3. Users

| Role | Uses Rassah to |
|---|---|
| **Packer** (primary user) | Type an order number, get carton + instructions + 3D view, confirm or correct |
| **Operations lead / store owner** | Watch the monitoring dashboard: quality, speed, cost, failures |

Target segment for the MVP: stores that sell **rigid, box-shaped products**: perfumes, cosmetics, electronics accessories, books, home goods. **Clothing is explicitly out of scope** because it deforms and has no fixed shape.

## 4. MVP scope

### 4.1 Features (MUST)

| # | Feature | Why it exists |
|---|---|---|
| F1 | **Mock store** in Supabase: ~30 synthetic products modeled on Salla product pages, ~20 orders, 5 carton types | We have no live store integration. The data shape mirrors a commerce platform so a real integration can replace it later. |
| F2 | **AI extraction** (Gemini): dimensions, weight, fragile, liquid, sensitive, the source of each value, confidence | The core AI step. Replaces manual data entry. |
| F3 | **Fallback chain**: page value → inferred from other text (e.g. "100 مل") → manual measurement. Never invent a value silently. | Most product pages lack dimensions. The system has to keep working without pretending. |
| F4 | **Catalog cache**: each product is extracted once; later orders reuse the stored facts | Cuts cost and latency. Gives us the cache-hit metric. |
| F5 | **Packing engine**: picks the cheapest valid carton with gravity, fragile-on-top and liquid-upright rules. Estimated dimensions get a safety margin. | Turns product facts into a decision. |
| F6 | **Independent validator** gating every layout | Guarantees we never show an impossible layout. |
| F7 | **Result screen**: carton, per-item instructions, 3D view, data-source badges, and *Confirm* / *Edit* buttons | The packer stays in control. Corrections become a quality signal. |
| F8 | **Event logging + monitoring dashboard + alert rules** | Required by the brief. Detects and helps investigate problems. |
| F9 | **Offline evaluation scripts** whose results are stored and shown | Gives credible numbers for the report and pitch. |

### 4.2 Out of scope (say this openly in the pitch)

Live Salla/Zid integration, scraping live websites, multi-carton orders, clothing and deformable items, pallets, manufacturer-spec web lookup, learning from scale weights, mobile app, authentication, real courier rate APIs.

### 4.3 Definition of done

- [ ] Any seeded order → carton + instructions + 3D view on the deployed Vercel URL.
- [ ] Every displayed layout has passed the independent validator.
- [ ] If no carton fits, the app says **"No valid carton found within the search budget"** and never fabricates a layout.
- [ ] Products with no usable data are blocked with a "measure this product" prompt, not guessed.
- [ ] Every extraction and every order run writes an event to Supabase. The dashboard shows real events with the time window and sample size.
- [ ] CI is green on `main`: lint, type-check, unit tests.
- [ ] Evaluation results (extraction + packing) are stored and appear on the Evaluation page and in the report.

## 5. Architecture

```
Browser (Next.js pages, RTL Arabic UI)
   │  POST /api/orders/{id}/pack
   ▼
Next.js Route Handlers on Vercel (Node.js runtime, server-only code)
   ├── lib/ai        → Gemini API (@google/genai)       [only for uncached products]
   ├── lib/engine    → packer → validator → cost → instructions   [pure TypeScript, no I/O]
   ├── lib/monitoring→ events, metrics, alert rules
   └── lib/db        → Supabase Postgres (service-role key, server only)
   ▼
Supabase: mock store tables, product_facts cache, event tables, eval tables, alerts
```

Design rules:
- **The engine is pure.** `lib/engine` has no network or database calls, so it is fully unit-testable and deterministic.
- **Secrets never reach the browser.** Gemini and Supabase service keys live only in server code (`import "server-only"`).
- **One request = one traceable run.** Each pack request gets a `run_id` that links its extraction events, order event and corrections.

Detailed diagrams: [diagrams.md](diagrams.md).

## 6. Stack decisions (summary)

| Decision | Choice | Alternative considered | Why |
|---|---|---|---|
| Hosting | Vercel | Streamlit Cloud | Team decision. Gives preview deployments per PR, which strengthens the dev-environment story. Streamlit cannot run on Vercel. |
| Language | TypeScript end to end | Next.js + Python functions | One language, one repo, one deploy. **Risk:** the team is stronger in Python (mitigation in §12). |
| LLM | Gemini Flash-tier via `@google/genai` | Claude, GPT | Team has access to Gemini. Flash tier is fast and cheap for short extraction. Model name is an env var. |
| Database | Supabase Postgres | SQLite | Persists across serverless invocations. Vercel functions have no durable local disk. |
| Packing | Own engine in TS | py3dbp (Python) | py3dbp can't run in our TS stack, and it lacks the gravity/fragile rules we need. We implement a naive baseline in TS for comparison. |
| 3D | react-three-fiber | Plotly.js | Lightweight, React-native, simple box meshes. |
| Charts | Recharts | Chart.js | React components, enough for 7 metrics. |
| Tests | Vitest | Jest | Fast, native TS/ESM. |

Each choice is detailed in `docs/stack/`.

## 7. Monitoring summary

Seven metrics, each tied to a failure it reveals. Full spec in [stack/06-monitoring.md](stack/06-monitoring.md).

| # | Metric | Category | Reveals |
|---|---|---|---|
| M1 | Packer correction rate on AI-extracted products | AI quality | Wrong extractions, weak prompt |
| M2 | Data-source mix (page / inferred / manual / unknown) | Data quality | Product pages missing data, so accuracy will drop |
| M3 | Validator rejections by reason | Engine correctness | Engine bugs (should be 0; any > 0 is critical) |
| M4 | No-carton rate | Engine / catalog fit | Carton catalog doesn't fit the products, or margins too large |
| M5 | Order latency p50/p95 (cached vs uncached) | Performance | Slow Gemini calls, cache not working |
| M6 | Gemini failure rate (API errors, schema/parse failures) | Health | Bad key, quota/rate limits, outage, malformed output |
| M7 | Cost per order (tokens → USD) and cache-hit rate | Cost | Cache disabled, prompt too long |

## 8. Evaluation summary

Full spec in [stack/07-evaluation.md](stack/07-evaluation.md).

| Evaluation | Dataset | Headline number |
|---|---|---|
| Extraction, explicit dimensions | 15 products whose text states dimensions | % of dimensions within ±1 cm; weight within ±10% |
| Extraction, inferred dimensions | 15 products with dimensions removed from the text | Mean absolute % error. **This number justifies the safety margin.** |
| Handling classification | All 30 products, hand-labeled | Fragile **recall** (missing a glass item is the costly error), precision, liquid accuracy |
| Honesty | Products with no usable info | % where the model returned `unknown` instead of inventing a value |
| Packing | 60 generated fixtures: 20 known-feasible, 20 impossible, 20 random | Known-feasible recall, false claims on impossible cases (must be 0), validator rejections of the naive baseline, p95 runtime |

> **Honesty note for the report:** the product dataset is **synthetic**, written by us in the style of Saudi store pages. Ground truth is defined by us. We say this in the report and in Q&A.

## 9. Repository layout (target)

```
/
├── app/                      Next.js App Router pages + API route handlers
├── components/               UI components (3D view, metric cards, charts)
├── lib/
│   ├── ai/                   Gemini client, prompt, response schema, extractor
│   ├── engine/               types, geometry, packer, baseline, validator, cost, instructions
│   ├── db/                   Supabase server client + typed queries
│   └── monitoring/           event writers, metric queries, alert rules
├── data/                     synthetic products, orders, cartons, ground truth (JSON)
├── scripts/                  seed.ts, eval-extraction.ts, eval-packing.ts
├── supabase/migrations/      SQL schema
├── tests/                    Vitest unit tests
├── docs/                     this plan, diagrams, stack docs, report drafts
└── .github/workflows/ci.yml  lint + typecheck + test on every PR
```

## 10. Team ownership (3 members)

Each member owns a lane but **pairs on review** of another lane, so everyone can explain everything.

| Member | Lane | Owns | Reviews |
|---|---|---|---|
| **M1: AI & Data** | Gemini extraction, synthetic dataset, extraction evaluation | `lib/ai`, `data/`, `scripts/eval-extraction.ts`, stack docs 02 and 07 | M2's engine |
| **M2: Engine & UI** | Packing engine, validator, cost, instructions, result page, 3D view | `lib/engine`, `components/PackingView3D`, order pages, stack docs 03 and 05 | M3's monitoring |
| **M3: Platform & Monitoring** | Next.js skeleton, Supabase, events, dashboard, alerts, Vercel, CI | `app/` shell, `lib/db`, `lib/monitoring`, `.github/`, stack docs 01, 04, 06, 08, 09 | M1's extraction |

Shared: report, pitch deck, rehearsal.

## 11. Timeline (Tue 20 Oct → Thu 22 Oct)

### Phase 0: Setup (Tue evening, ~1.5 h, everyone)

| Task | Owner | Done when |
|---|---|---|
| T0. Message 2–3 Salla/Zid merchants: "How do you choose cartons? Do you see breakage or oversized boxes?" | M1 | Messages sent (any reply is a bonus) |
| T1. Confirm AI requirement with the instructor | M3 | Written answer received |
| T2. Create Gemini API key (Google AI Studio). Create Supabase project. Create Vercel project linked to the repo. | M3 | Keys stored in Vercel env + local `.env.local` |
| T3. Scaffold Next.js + TS + Tailwind + ESLint + Vitest. Push to `main`. Vercel production deploy works. | M3 | Hello page live on Vercel |
| T4. CI workflow (lint, typecheck, test) | M3 | Green check on a PR |

### Phase 1: Core build (Tue night → Wed midday)

| Task | Owner | Depends on | Done when |
|---|---|---|---|
| T5. Supabase migration `0001_init.sql` + seed script | M3 | T2 | Tables exist, seed loads 30 products / 20 orders / 5 cartons |
| T6. Synthetic dataset: 30 products (15 explicit, 12 inferable, 3 no-info) + ground truth + 20 orders + 5 cartons | M1 | none | JSON files merged |
| T7. Engine types, geometry helpers, validator **first** + tests | M2 | none | Validator tests green |
| T8. Packer (extreme points + gravity + rules + strategies) + cost model + tests | M2 | T7 | Packer tests green, all outputs pass validator |
| T9. Gemini extractor: prompt, schema, Zod validation, fallback, margin, retries | M1 | T2 | Extracts all 30 products locally |
| T10. `POST /api/orders/[id]/pack`: cache lookup → extract misses → pack → validate → events | M3 + M1 | T5, T8, T9 | Returns a full result JSON for every seeded order |
| T11. Event writers + `run_id` tracing | M3 | T5 | Rows appear in `extraction_events` / `order_runs` |

**Checkpoint (Wed ~13:00):** an order number returns a valid carton via the API on the Vercel preview. If not, apply the cut list (§13) immediately.

### Phase 2: Product surface (Wed afternoon)

| Task | Owner | Done when |
|---|---|---|
| T12. Order page + result page (carton, instructions, source badges, Confirm/Edit) | M2 | Usable end to end |
| T13. 3D view | M2 | Boxes render with fragile/liquid colors |
| T14. Edit/measure form → `corrections` + `product_facts` update + re-pack | M2 + M1 | Correction rate moves on the dashboard |
| T15. Monitoring dashboard (7 metrics, window selector, sample size, alert banner) | M3 | Shows live data |
| T16. Alert rules + demo fault injection | M3 | Simulated outage raises the M6 alert |

### Phase 3: Evaluation & hardening (Wed evening)

| Task | Owner | Done when |
|---|---|---|
| T17. `eval-extraction.ts` run on all 30 products, results stored | M1 | Numbers in `eval_runs` + `docs/report/results.md` |
| T18. `eval-packing.ts` (60 fixtures, engine vs naive baseline) | M2 | Numbers stored |
| T19. Evaluation page | M3 | Displays latest eval runs |
| T20. Prompt iteration if extraction eval is weak (record before/after numbers) | M1 | Change documented in the decision log |
| T21. Pre-warm catalog on production (run extraction for all products once) | M1 | Demo orders are cache hits |
| T22. Production smoke test of all 20 orders | M3 | No errors |

### Phase 4: Deliverables (Wed night → Thu morning)

| Task | Owner | Done when |
|---|---|---|
| T23. Concise report (`docs/report/REPORT.md`, exported to PDF) | All (M1 leads) | Covers every item in §14 |
| T24. Diagrams exported as images for report/deck | M3 | PNGs in `docs/report/` |
| T25. Pitch deck (3 min) | All (M2 leads) | Rehearsed twice, under 3:00 |
| T26. Q&A drill: each member answers the question bank in §15 about **another member's** lane | All | Everyone passes |
| T27. Offline backup: local `npm run dev` against the same Supabase + recorded demo video | M3 | Backup tested |

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Instructor rejects "AI" framing | Fatal | T1 today. The LLM step is the AI core. Engine framed as classical AI search. |
| Team stronger in Python than TS | Q&A failure on code questions | Keep engine code plain (no clever generics), comment the *why*, pair reviews across lanes, T26 drill. Each member walks through one file they didn't write. |
| No Gemini key yet / free-tier rate limits | Extraction blocked or 429s during demo | Create key in T2. Concurrency limit 2, retry with backoff on 429. Pre-warm the catalog (T21) so demo orders don't call Gemini. |
| Gemini invents dimensions | Wrong cartons | Prompt says "return null, never guess". Every value has a `source`. Inferred values get a margin. Eval measures honesty. |
| Vercel function timeout on uncached orders | Failed request | Cache. Parallel extraction with a limit. Cap order size (≤ 12 units). Short Gemini output. |
| Supabase unreachable | Dashboard empty | Pack still returns a result. The UI shows "monitoring degraded". Never claims events were saved. |
| Synthetic data criticized | Credibility | State it openly. Show the eval methodology. Ask for a pilot with a real merchant as next step. |
| Scope overrun | Nothing works on Thursday | Cut list below. Checkpoint at Wed 13:00. |

## 13. Cut list (apply in this order if behind schedule)

Never cut: **validator, event logging, tests, honesty about data**.

1. UI polish (keep it clean and plain)
2. 3D view → 2D top-down + side view (SVG)
3. Edit form → only "Confirm" + "Measure manually" for unknown items
4. Shipping cost → carton cost + volumetric weight only
5. Packing strategies → one ordering instead of four
6. Evaluation page → results only in the report

## 14. Deliverables checklist (from the brief)

| # | Deliverable | Where |
|---|---|---|
| 1 | Functional AI product MVP | Vercel production URL |
| 2 | Development environment | Repo + README run steps + CI + Vercel previews + tests ([stack/08](stack/08-testing-quality.md), [stack/09](stack/09-vercel-ci.md)) |
| 3 | Monitoring dashboard connected to the product | `/monitoring` page backed by Supabase events |
| 4 | GitHub repository | this repo |
| 5 | Concise report: problem, solution, data collection, benchmarks, technical design, selected metrics, evaluation results, tools, diagrams, references | `docs/report/REPORT.md` → PDF |
| 6 | Pitch deck | `docs/report/` (export) |
| — | Two technical diagrams | [diagrams.md](diagrams.md) |
| — | AI tools & decisions log | `docs/report/TOOLS.md` (see below) |

### AI tools log (fill in as you go)

The brief requires us to state which tools we used, what they did, why we chose them, which parts were generated vs written by hand, and how we verified them. Keep a running table in `docs/report/TOOLS.md`:

| Tool | Used for | Generated / assisted / manual | How we verified |
|---|---|---|---|
| Claude (Claude Code) | Planning, research critique, code scaffolding | Assisted | Code review by a teammate, unit tests, eval runs |
| Gemini API | Runtime product extraction | Product feature | Extraction eval against hand-labeled ground truth |
| … | … | … | … |

## 15. Q&A preparation (question bank)

Every member must answer every question:

1. Why is this AI and not `if/else`?
2. Why not ask Gemini to choose the carton directly?
3. How do you know a layout is physically valid? Draw the overlap check.
4. What happens when a product page has no dimensions?
5. Where does the 15% safety margin come from? (Answer: the inferred-dimension eval error.)
6. What does each dashboard metric reveal? Walk through one investigation.
7. Is the data real? (No, synthetic. Explain the methodology and the pilot plan.)
8. What does the engine **not** guarantee? (Global optimum, real-world crush strength, deformable items.)
9. What did AI tools generate, and how did you verify it?
10. What happens if Gemini is down during packing? (Cached products still work. Uncached ones fail visibly and trigger the alert.)
11. Why Supabase / Vercel / TypeScript?
12. What is the next step after the camp? (Pilot with one merchant, real Salla integration, multi-carton.)

## 16. Pitch outline (3:00)

| Time | Content |
|---|---|
| 0:00–0:30 | Problem: oversized cartons raise shipping cost (volumetric weight), and fragile items break. Merchants don't have dimension data. |
| 0:30–1:00 | Before/After: packer guesses → packer types order number, gets carton + instructions |
| 1:00–1:50 | **Live demo**: order with a perfume (inferred dims, fragile, liquid) + a book. Show source badges, instructions, 3D. |
| 1:50–2:20 | Evaluation numbers (extraction accuracy, fragile recall, packing validity) |
| 2:20–2:45 | Monitoring: dashboard + one investigation story (e.g. prompt fix that lowered correction rate) |
| 2:45–3:00 | Limits stated honestly + next step: pilot with a real merchant |

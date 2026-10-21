# Rassah: Implementation Checklist (Single Source of Truth)

> **How to use this file**
> - This is the **only** place where task status is tracked. If it's not here, it isn't planned. If it isn't ticked here, it isn't done.
> - Tick a box (`- [x]`) **only** when its "done when" condition is met *and* the change is merged to `main` (or the external setup is verified).
> - Each task has an ID (`P4.12`), an owner (`M1` / `M2` / `M3` / `ALL`), and where relevant the PLAN task it implements (`→T8`).
> - Update the **Progress dashboard** and the **Blockers** table at every sync (minimum: Tue night, Wed 13:00 checkpoint, Wed night, Thu morning).
> - Specs live in [PLAN.md](PLAN.md) and [`docs/stack/`](stack/). This file says *what to do and when it counts as done*, the specs say *how*.
> - **Never write secret values in this file or anywhere in git.** The credentials register records *that* a secret exists and *where* it is stored.

**Team:** M1 = AI & Data · M2 = Engine & UI · M3 = Platform & Monitoring
**Deadline:** Thursday 22 Oct 2026. Pitch 3 min + Q&A 10 min.

---

## Progress dashboard

| Phase | Name | Owner(s) | Target | Tasks | Done | Status |
|---|---|---|---|---|---|---|
| 0 | Accounts, access, credentials, decisions | M3 + ALL | Tue 20 Oct, evening | 33 | 8 | 🟨 In progress |
| 1 | Repository scaffold & dev environment | M3 | Tue 20 Oct, night | 39 | 30 | 🟨 In progress |
| 2 | Database (Supabase) | M3 | Tue night | 30 | 24 | 🟨 In progress |
| 3 | Synthetic dataset | M1 | Tue night → Wed morning | 31 | 27 | 🟨 In progress |
| 4 | Packing engine, validator, cost, instructions | M2 | Wed morning | 54 | 52 | 🟨 In progress |
| 5 | AI extraction (Gemini) | M1 | Wed morning | 46 | 41 | 🟨 In progress |
| 6 | Pack pipeline API & actions | M3 + M1 | Wed 13:00 ⛳ | 37 | 33 | 🟨 In progress |
| 7 | User interface (orders, result, catalog, 3D) | M2 | Wed afternoon | 47 | 39 | 🟨 In progress |
| 8 | Monitoring & alerting | M3 | Wed afternoon | 49 | 41 | 🟨 In progress |
| 9 | Offline evaluation | M1 + M2 | Wed evening | 36 | 35 | 🟨 In progress |
| 10 | Deployment, security & hardening | M3 | Wed evening | 33 | 18 | 🟨 In progress |
| 11 | Deliverables: report, diagrams, tools log, deck | ALL | Wed night | 52 | 27 | 🟨 In progress |
| 12 | Demo-day readiness | ALL | Thu 22 Oct, morning | 30 | 0 | ⬜ Not started |
| **Total** | | | | **517** | **375** | |

Status legend: ⬜ Not started · 🟨 In progress · 🟥 Blocked · ✅ Done (gate passed)

**Progress command** (counts ticked vs. total boxes per phase):

```bash
# bash / Git Bash
awk '/^## Phase/{p=$0} /^- \[[ x]\]/{t[p]++} /^- \[x\]/{d[p]++} END{for(k in t) printf "%-60s %3d / %3d\n", k, d[k], t[k]}' docs/CHECKLIST.md | sort
```

### Critical path (if any of these slip, the demo is at risk)

`P0.10 Gemini key` → `P5 extractor` → `P6 pack route` ⛳ Wed 13:00 → `P7 result page` → `P8 dashboard` → `P10 production deploy` → `P12 smoke test`
In parallel and also blocking: `P2 schema` → `P2 seed`, and `P4 validator` → `P4 packer`.

### Phase gates (a phase is ✅ only when its gate passes)

| Gate | Condition |
|---|---|
| G0 | Every credential in the register exists, is stored in the right place, and all 3 members have access |
| G1 | Fresh clone → `npm ci && npm run check && npm run dev` works on **all 3 laptops**; Vercel production shows the scaffold; CI is green on a test PR |
| G2 | Migration applied; seed loads 30 products / 5 cartons / 20 orders; RLS on for every table |
| G3 | Dataset files validate against their schema; ground truth was written by a different member than the descriptions |
| G4 | All engine tests are green, including the 200-order property test (every layout passes the validator) |
| G5 | Extractor runs on all 30 products locally with zero crashes; every attempt writes an event |
| G6 ⛳ | **Wed 13:00:** every seeded order returns the correct status from the pack API on a Vercel preview. If not, apply the cut list (§ Cut list) immediately |
| G7 | The packer flow works end to end in the browser on the preview: order → result → 3D → confirm/edit |
| G8 | The dashboard shows all 7 metrics from real events. The simulated outage fires and resolves the M6 alert. |
| G9 | Both eval runs are stored; numbers are in `docs/report/results.md`; margin decision recorded |
| G10 | Production deploy is green; security checklist is fully ticked; all 20 orders pass the smoke test on production |
| G11 | Report PDF, deck, diagrams PNG, tools log all exist and were reviewed by all 3 members |
| G12 | Two full rehearsals under 3:00; every member passed the Q&A drill on another member's lane |

---

## Credentials & external services register

> Record **where** each secret lives, never its value. "Stored in" = password manager / Vercel env / `.env.local` (local only, git-ignored).

| # | Service / credential | Purpose | Created by | Stored in | Shared with | Done |
|---|---|---|---|---|---|---|
| C1 | GitHub repo `justAbdulaziz10/Rassah`: write access | Code, PRs, CI | Repo owner | GitHub | M1, M2, M3 | ⬜ |
| C2 | Google account / project for AI Studio | Owns the Gemini key | M3 | Team password manager | ALL | ✅ |
| C3 | `GEMINI_API_KEY` | Gemini API auth | M3 | Vercel env (Preview + Prod) + each `.env.local` | ALL | ✅ |
| C4 | Gemini model id (`GEMINI_MODEL`) | Which Flash-tier model (now `gemini-3.5-flash-lite`, 2026-10-21) | M1 | Vercel env + `.env.example` (name only) | ALL | ✅ |
| C5 | Gemini prices (`GEMINI_PRICE_INPUT_PER_M`, `GEMINI_PRICE_OUTPUT_PER_M`) + date copied | Cost metric ($0.30 in / $2.50 out per 1M, 2026-10-21) | M1 | Vercel env + report | ALL | ✅ |
| C6 | Supabase account + organization | Database hosting | M3 | Password manager | ALL (invited to org) | ✅ |
| C7 | Supabase project database password | Direct DB / CLI access | M3 | Password manager | ALL | ⬜ (DB password not recorded) |
| C8 | `SUPABASE_URL` | DB endpoint | M3 | Vercel env + `.env.local` | ALL | ✅ |
| C9 | `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access (bypasses RLS) | M3 | Vercel env + `.env.local` **only** | ALL | ✅ |
| C10 | Vercel account / team | Hosting | M3 | Password manager | ALL (team members) | ✅ |
| C11 | Vercel ↔ GitHub integration | Auto preview + prod deploys | M3 | Vercel | — | ✅ |
| C12 | `ALERT_WEBHOOK_URL` (optional, Discord/Slack) | Alert delivery | M3 | Vercel env | ALL | ⬜ |
| C13 | Team password manager / secure shared note | Hold C2–C12 | M3 | (e.g. Bitwarden shared collection) | ALL | ⬜ |

### Environment variable matrix

| Variable | `.env.example` (name only) | `.env.local` | Vercel Preview | Vercel Production | GitHub Actions |
|---|---|---|---|---|---|
| `GEMINI_API_KEY` | ✔ | ✔ | ✔ | ✔ | ✖ (never) |
| `GEMINI_MODEL` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `GEMINI_PRICE_INPUT_PER_M` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `GEMINI_PRICE_OUTPUT_PER_M` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `SUPABASE_URL` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `DEMO_MODE` | ✔ | `true` | `true` | `true` (demo) | ✖ |
| `ENGINE_VERSION` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `PROMPT_VERSION` | ✔ | ✔ | ✔ | ✔ | ✖ |
| `ALERT_WEBHOOK_URL` | ✔ | optional | optional | optional | ✖ |

CI needs **no** secrets because tests never call external services.

---

## Phase 0: Accounts, access, credentials, decisions

**Owner:** M3 (setup) + ALL · **Target:** Tue 20 Oct evening · **Gate:** G0

### 0A. Decisions and confirmations
- [x] **P0.1** (M3, →T1) Message the instructor: "Our product uses an LLM (Gemini) to extract product dimensions and handling flags from product-page text, and a search-based engine to pack items into the cheapest safe carton. Does this satisfy *AI-powered product*?" Done when: written reply received and pasted into `docs/decisions.md`. ✅ 20 Oct: **APIs are allowed. No fine-tuning needed.** Recorded in [decisions.md](decisions.md).
- [x] **P0.2** (ALL) If P0.1 is negative, hold an emergency call within 1 hour and record the decision. ✅ Not needed (P0.1 positive).
- [ ] **P0.3** (ALL) Re-confirm the stack decision: TypeScript on Vercel (team is stronger in Python). Record it in `docs/decisions.md`.
- [ ] **P0.4** (ALL) Confirm lane ownership (M1/M2/M3) and review pairs from PLAN §10.
- [ ] **P0.5** (ALL) Agree on sync times: Tue 23:00, Wed 09:00, Wed 13:00 ⛳, Wed 18:00, Wed 23:00, Thu 08:00.
- [ ] **P0.6** (ALL) Create a team chat channel for blockers. Link it in the Blockers section below.

### 0B. Customer discovery (problem validation)
- [ ] **P0.7** (M1, →T0) Pick 3 Salla/Zid stores that sell rigid products (perfume, cosmetics, electronics, books). Note them in `docs/discovery.md`.
- [ ] **P0.8** (M1) Send each a short message: how do they choose cartons, do they see breakage or oversized boxes, and how many carton sizes do they keep.
- [ ] **P0.9** (M1) Log replies (or "no reply") in `docs/discovery.md` by Wed 18:00. Never invent replies.

### 0C. Gemini (Google AI Studio)
- [x] **P0.10** (M3, →T2) Create the Gemini API key in Google AI Studio (C2, C3). **Critical path.** — done 2026-10-21 (key created by the owner)
- [x] **P0.11** (M1) Choose the model: a current Flash-tier model listed in AI Studio. Record the exact id (C4). — gemini-3.5-flash-lite (3.8-flash and 3.6-flash free tier = 20 requests/day; switched 2026-10-21)
- [x] **P0.12** (M1) Record the free-tier rate limits (requests/min, requests/day) shown for that model in `docs/decisions.md`. They decide concurrency (P5.27). — free tier = 20 requests/day/model; recorded in decisions.md
- [x] **P0.13** (M1) Copy input/output prices per 1M tokens from Google's official pricing page with today's date (C5). — $0.30 in / $2.50 out per 1M (2026-10-21); recorded in decisions.md
- [ ] **P0.14** (M1) Quick sanity call: send one product description in AI Studio's UI and confirm it returns JSON. Screenshot it for the tools log.

### 0D. Supabase
- [x] **P0.15** (M3, →T2) Create the Supabase organization + project (region close to Saudi Arabia, e.g. EU/Middle East if offered) (C6). — project `rassah` (etxxhydkvtixajxkwgmn), org newmillion, eu-central-1 Frankfurt, free plan
- [ ] **P0.16** (M3) Store the DB password in the password manager (C7). — NOT DONE: DB password not recorded (C7 open)
- [ ] **P0.17** (M3) Copy the project URL and service-role key into the password manager (C8, C9). — partial: URL + service-role key are in local .env.local and Vercel env, not in a password manager
- [ ] **P0.18** (M3) Invite M1 and M2 to the Supabase organization. — not done
- [ ] **P0.19** (M3) Note the free-tier limits (DB size, inactivity pause) in `docs/decisions.md`.

### 0E. Vercel
- [ ] **P0.20** (M3, →T2) Create the Vercel account/team (C10) and invite M1, M2. — partial: team "abdulaziz's projects" exists; invites for M1/M2 not done
- [x] **P0.21** (M3) Install the Vercel GitHub app with access to the `Rassah` repo (C11). — project `rassah` linked to justAbdulaziz10/Rassah, production branch main
- [ ] **P0.22** (M3) Note the plan's function max-duration limit in `docs/decisions.md` (used in P6.1).

### 0F. GitHub
- [ ] **P0.23** (Repo owner) Give M1, M2, M3 write access to the repo (C1).
- [ ] **P0.24** (ALL) Each member clones the repo and can push a test branch.
- [ ] **P0.25** (M3) Create GitHub labels: `lane:ai`, `lane:engine`, `lane:platform`, `blocker`, `cut-list`.

### 0G. Local machines (each member)
- [ ] **P0.26** (M1) Node.js LTS + npm installed (`node -v` recorded), Git configured, editor ready.
- [ ] **P0.27** (M2) Node.js LTS + npm installed, Git configured, editor ready.
- [ ] **P0.28** (M3) Node.js LTS + npm installed, Git configured, editor ready.
- [ ] **P0.29** (ALL) All three use the **same** Node major version (written to `.nvmrc` in P1.6).

### 0H. Shared secrets handling
- [ ] **P0.30** (M3) Set up the team password manager or a secure shared note (C13).
- [ ] **P0.31** (M3) Move all credentials C2–C12 into it. Delete them from chat messages.
- [ ] **P0.32** (ALL) Each member confirms they can read the shared secrets.
- [ ] **P0.33** (M3) Fill in the "Done" column of the credentials register above. **Gate G0 check.**

---

## Phase 1: Repository scaffold & development environment

**Owner:** M3 · **Target:** Tue night · **Gate:** G1 · **Spec:** [stack/01](stack/01-nextjs-typescript.md), [stack/08](stack/08-testing-quality.md), [stack/09](stack/09-vercel-ci.md)

### 1A. Project creation
- [x] **P1.1** (M3, →T3) `create-next-app` in the repo root with TypeScript, Tailwind, ESLint, App Router, `@/*` alias. Keep `docs/` intact.
- [x] **P1.2** (M3) Install runtime deps: `@google/genai @supabase/supabase-js zod recharts three @react-three/fiber @react-three/drei server-only`.
- [x] **P1.3** (M3) Install dev deps: `vitest @vitest/coverage-v8 tsx @types/three`.
- [x] **P1.4** (M3) Pin exact versions in `package.json` (remove `^`/`~`). Commit `package-lock.json`.
- [x] **P1.5** (M3) Add `"engines": { "node": "<LTS major>" }` to `package.json`.
- [x] **P1.6** (M3) Add `.nvmrc` with the same Node version.
- [x] **P1.7** (M3) Confirm `tsconfig.json` has `"strict": true`.

### 1B. Repo hygiene files
- [x] **P1.8** (M3) `.gitignore` covers `node_modules`, `.next`, `.env*` (except `.env.example`), `coverage`, `.vercel`, OS files.
- [x] **P1.9** (M3) `.env.example` lists **every** variable from the env matrix, names only.
- [x] **P1.10** (M3) `.gitattributes` with `* text=auto eol=lf` (avoids CRLF noise on Windows).
- [x] **P1.11** (M3) `.editorconfig` (2-space indent, LF, UTF-8).
- [x] **P1.12** (M3) `LICENSE` file (MIT unless the team decides otherwise).
- [x] **P1.13** (M3) README: add **Getting started** (prerequisites, `npm ci`, copy `.env.example` → `.env.local`, `npm run seed`, `npm run dev`).
- [x] **P1.14** (M3) Create `docs/decisions.md` (date · decision · reason · alternatives) with the decisions made so far.
- [x] **P1.15** (M3) Create `docs/report/` with empty `REPORT.md`, `TOOLS.md`, `results.md`.

### 1C. Folder skeleton (empty modules with a TODO comment + exported types)
- [x] **P1.16** (M3) `lib/ai/`, `lib/engine/`, `lib/db/`, `lib/monitoring/` created, each with an `index.ts`.
- [x] **P1.17** (M3) `components/`, `data/`, `scripts/`, `supabase/migrations/`, `tests/`, `tests/fixtures/gemini/`, `eval/results/` created (`.gitkeep` where empty).
- [x] **P1.18** (M3) `lib/env.ts`: reads and validates env vars with Zod at startup, with a clear error naming the missing variable. Server only.

### 1D. Scripts and quality tooling
- [x] **P1.19** (M3) `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:coverage`, `check`, `seed`, `eval:extraction`, `eval:packing`.
- [x] **P1.20** (M3) `vitest.config.ts` with the `@/*` alias and `environment: "node"`.
- [x] **P1.21** (M3) One trivial passing test (`tests/smoke.test.ts`) so CI has something to run.
- [x] **P1.22** (M3) Lint command works (`next lint` or `eslint .`, whichever the scaffold supports). Recorded in stack/08.
- [x] **P1.23** (M3) `npm run check` passes locally.

### 1E. App shell
- [x] **P1.24** (M3) `app/layout.tsx`: `<html lang="ar" dir="rtl">`, Arabic font via `next/font/google`, top nav: Orders · Catalog · Monitoring · Evaluation.
- [x] **P1.25** (M3) Placeholder pages for `/orders`, `/catalog`, `/monitoring`, `/evaluation`. `/` redirects to `/orders`.
- [x] **P1.26** (M3) Tailwind: define the fixed color tokens (fragile amber, liquid blue, sensitive purple, estimated dashed) as CSS variables.
- [x] **P1.27** (M3) `app/not-found.tsx` and `app/error.tsx` with friendly Arabic messages.
- [x] **P1.28** (M3) `GET /api/health` returns `{ app: "ok", geminiKeyPresent, supabase: "ok" | "error" }`. Never return key values.

### 1F. CI
- [x] **P1.29** (M3, →T4) `.github/workflows/ci.yml`: checkout → setup-node (`.nvmrc`, npm cache) → `npm ci` → lint → typecheck → test.
- [x] **P1.30** (M3) Open a test PR. CI runs and passes.

### 1G. Vercel
- [ ] **P1.31** (M3) Import the repo into Vercel. Framework detected as Next.js. Node version matches `.nvmrc`.
- [ ] **P1.32** (M3) Add all env vars to Vercel **Preview** and **Production** (per the matrix).
- [ ] **P1.33** (M3) Production deploy of the scaffold succeeds. URL recorded at the top of README.
- [ ] **P1.34** (M3) The test PR from P1.30 gets a Vercel **preview URL** comment.

### 1H. Branch protection and onboarding
- [ ] **P1.35** (M3) Enable branch protection on `main`: require `CI / check` + 1 approving review, no direct pushes.
- [ ] **P1.36** (M1) Fresh clone → `npm ci` → `npm run check` → `npm run dev` works.
- [ ] **P1.37** (M2) Fresh clone → `npm ci` → `npm run check` → `npm run dev` works.
- [ ] **P1.38** (M3) Fresh clone → `npm ci` → `npm run check` → `npm run dev` works.
- [ ] **P1.39** (M3) Update the progress dashboard. **Gate G1 check.**

---

## Phase 2: Database (Supabase)

**Owner:** M3 · **Target:** Tue night · **Gate:** G2 · **Spec:** [stack/04](stack/04-supabase.md)

### 2A. Schema
- [x] **P2.1** (M3, →T5) Write `supabase/migrations/0001_init.sql` exactly per stack/04 (all 11 tables).
- [x] **P2.2** (M3) Check constraints present: sources, statuses, triggers, severities, employee actions, `qty` 1–12.
- [x] **P2.3** (M3) Indexes on `extraction_events(created_at desc)` and `order_runs(created_at desc)`.
- [x] **P2.4** (M3) Add index `extraction_events(run_id)` and `corrections(run_id)` for the run trace.
- [ ] **P2.5** (M3) `gen_random_uuid()` available (the `pgcrypto` extension is enabled by default on Supabase. Verify).
- [x] **P2.6** (M3) RLS **enabled on all 11 tables**, with no public policies.
- [ ] **P2.7** (M3) Apply the migration (SQL editor or `supabase db push`). Record how in README. — partial: applied via Supabase MCP apply_migration; README note not written
- [ ] **P2.8** (M2) Review: the schema matches the API contract fields in stack/01 and the event fields in stack/06.

### 2B. Access layer
- [x] **P2.9** (M3) `lib/db/server.ts`: `import "server-only"`, a service-role client, `persistSession: false`.
- [x] **P2.10** (M3) Define a small `Db` interface (the queries the app needs) so tests can use an in-memory fake.
- [x] **P2.11** (M3) Typed row types for each table in `lib/db/types.ts` (hand-written or generated with `supabase gen types`).
- [x] **P2.12** (M3) Queries: `getOrderWithItems(orderId)`.
- [x] **P2.13** (M3) Queries: `getProductFacts(productIds[])`, `upsertProductFacts(facts)`.
- [x] **P2.14** (M3) Queries: `listCartons()`.
- [x] **P2.15** (M3) Queries: `insertExtractionEvent`, `insertOrderRun`, `updateOrderRunAction`, `insertCorrections`.
- [x] **P2.16** (M3) Queries: `insertAlert`, `getOpenAlerts`, `resolveAlert`.
- [x] **P2.17** (M3) Queries: `insertEvalRun`, `insertEvalResults`, `getLatestEvalRuns(kind)`.
- [x] **P2.18** (M3) Queries: `getRunTrace(runId)` returns the order run + extraction events + corrections.
- [x] **P2.19** (M3) In-memory fake implementing the `Db` interface (`tests/fakes/db.ts`).

### 2C. Seed and reset
- [x] **P2.20** (M3, →T5) `scripts/seed.ts`: upsert products (computing `source_hash`), cartons, orders, order_items from `data/*.json`.
- [ ] **P2.21** (M3) Seed is idempotent: running it twice causes no duplicates and no errors.
- [x] **P2.22** (M3) Seed **never** writes `product_facts` or ground truth.
- [x] **P2.23** (M3) `scripts/reset-events.ts`: deletes rows from `extraction_events`, `order_runs`, `corrections`, `alerts` (not eval tables, not facts). Asks for `--yes`.
- [x] **P2.24** (M3) `scripts/clear-facts.ts --product p-07` for demoing a cache miss (and `--all` with `--yes`).
- [x] **P2.25** (M3) Run the seed against Supabase. Verify counts: 30 / 5 / 20. — seed run: products 30, cartons 5, orders 20, order_items 51

### 2D. Investigation queries
- [x] **P2.26** (M3) `docs/queries.sql` with the investigation queries from stack/04 (failed extractions, most-corrected products, run trace).
- [ ] **P2.27** (M3) Each query tested in the SQL editor.

### 2E. Verification
- [x] **P2.28** (M3) `/api/health` reports `supabase: "ok"` locally and on the Vercel preview. — production health reports database ok
- [x] **P2.29** (M3) Verify the anon key **cannot** read any table (quick REST call with the anon key returns nothing or 401). — anon REST read of products returned [] (RLS blocks anon)
- [ ] **P2.30** (M3) Update the dashboard. **Gate G2 check.**

---

## Phase 3: Synthetic dataset

**Owner:** M1 (descriptions), M2 (ground truth) · **Target:** Tue night → Wed morning · **Gate:** G3 · **Spec:** [stack/07 §1](stack/07-evaluation.md)

### 3A. Schemas
- [x] **P3.1** (M1) Zod schemas in `lib/data/schemas.ts` for `products.json`, `ground_truth.json`, `cartons.json`, `orders.json`, `packing_fixtures.json`.
- [x] **P3.2** (M1) `scripts/validate-data.ts` validates all data files and cross-references (every order product exists, every product has ground truth). Add it to `npm run check`.

### 3B. Products (`data/products.json`, 30)
- [x] **P3.3** (M1, →T6) Group A, 15 explicit products: dimensions + weight stated in the text.
- [x] **P3.4** (M1) Group A format variety: at least 3 with Arabic-Indic digits, 2 in inches/lb, 2 using "الطول/العرض/الارتفاع", 2 with dims buried mid-paragraph, 2 with "x" and 2 with "×".
- [x] **P3.5** (M1) Group B, 12 inferable products: no dimensions, but clues (ml, page count, size label, pieces per box, known type).
- [x] **P3.6** (M1) Group C, 3 no-info products: vague marketing text only.
- [x] **P3.7** (M1) Category coverage: perfumes, oud/incense burners (ceramic), skincare glass + plastic, honey/olive oil glass, books, mugs, phone accessories, power banks, small appliance, dates box, glass candle.
- [x] **P3.8** (M1) At least 8 fragile, 6 liquid (some both), 4 sensitive, and some products with none.
- [x] **P3.9** (M1) At least 2 "implicit fragile" products where fragility is only implied ("كريستال", "خزف") with no word "قابل للكسر".
- [x] **P3.10** (M1) Each product has `id`, `name`, `description`, `category`, illustrative `url`.
- [x] **P3.11** (M1) A header note in the file states: synthetic, written by the team, modeled on Saudi store pages.

### 3C. Ground truth (`data/ground_truth.json`)
- [ ] **P3.12** (M2) Written by **M2** (not the author of the descriptions) for all 30 products.
- [x] **P3.13** (M2) Fields: `lengthCm, widthCm, heightCm` (natural upright orientation, `heightCm` = vertical side; the eval sorts before comparing), `weightG`, `fragile`, `liquid`, `sensitive`, `expectedDimsSource`.
- [x] **P3.14** (M2) Group B ground-truth sizes are realistic for the product type (sanity-checked against similar real items).
- [x] **P3.15** (M1) Pick 10 products as the **holdout** set (mixed groups). Mark them in ground truth (`holdout: true`).
- [ ] **P3.16** (M1+M2) Disagreements between author and labeler resolved and noted.

### 3D. Cartons (`data/cartons.json`)
- [x] **P3.17** (M2) 5 cartons per stack/07 (S, FLAT, M, L, XL): inner dims, max weight, tare weight, synthetic cost.
- [x] **P3.18** (M2) Shipping constants (`BASE_SAR`, `PER_KG_SAR`) in the same file, labeled synthetic.

### 3E. Orders (`data/orders.json`, 20)
- [x] **P3.19** (M1) 20 orders, 2–6 products each, quantities 1–3.
- [x] **P3.20** (M1) Includes a fragile + heavy mix.
- [x] **P3.21** (M1) Includes an order with two liquids.
- [x] **P3.22** (M1) Includes an order with an inferred-dimension product.
- [x] **P3.23** (M1) Includes an order with a group-C product (→ `needs_measurement`).
- [x] **P3.24** (M1) Includes an order too large for every carton (→ `no_box`).
- [x] **P3.25** (M1) Includes a single-item order (simplest demo).
- [x] **P3.26** (M1) Mark 3 orders as **demo orders** in a comment/README: quick success, fragile + liquid + estimated, impossible.

### 3F. Packing fixtures
- [x] **P3.27** (M2) `scripts/gen-packing-fixtures.ts` with a fixed seed creates `data/packing_fixtures.json`: 20 known-feasible (guillotine split, fragile only in the top layer), 20 impossible (oversize / overweight / liquid too tall), 20 random.
- [x] **P3.28** (M2) Each known-feasible fixture stores its witness carton id. Each impossible fixture stores its reason.
- [x] **P3.29** (M2) Re-running the generator produces a byte-identical file.

### 3G. Verification
- [ ] **P3.30** (M1) `scripts/validate-data.ts` passes. The seed (P2.25) succeeds with the final data.
- [ ] **P3.31** (M1) Update the dashboard. **Gate G3 check.**

---

## Phase 4: Packing engine, validator, cost, instructions

**Owner:** M2 · **Reviewer:** M1 · **Target:** Wed morning · **Gate:** G4 · **Spec:** [stack/03](stack/03-packing-engine.md)

### 4A. Types and geometry
- [x] **P4.1** (M2, →T7) `types.ts`: `ProductFacts`, `Unit`, `Carton`, `Placement`, `Layout`, `PackResult` (statuses: `box_found`, `no_box`, `needs_measurement`), `Violation` (9 codes), `SkipReason`.
- [x] **P4.2** (M2) `config.ts`: `MARGIN_INFERRED=0.15`, `PADDING_CM=1.5`, `MIN_SUPPORT=0.70`, `MAX_SEARCH_MS=1500`, `VOLUMETRIC_DIVISOR=5000`, `WALL_CM=0.5`, `EPS=1e-6`, `MAX_UNITS=12`, `ENGINE_VERSION`.
- [x] **P4.3** (M2) `geometry.ts`: `rotations(dims, liquid)` deduplicated (6 normal / 2 liquid).
- [x] **P4.4** (M2) `geometry.ts`: interval overlap with EPS, box overlap, footprint contact area.

### 4B. Validator (build and test FIRST)
- [x] **P4.5** (M2) `validator.ts` has **no imports** from `packer.ts` (add a test or lint rule that enforces it).
- [x] **P4.6** (M2) Check `out_of_bounds`.
- [x] **P4.7** (M2) Check `overlap` (pairwise, separated on at least one axis).
- [x] **P4.8** (M2) Check `overweight` (units + carton tare vs max).
- [x] **P4.9** (M2) Check `floating` (z = 0 or support ratio ≥ `MIN_SUPPORT`).
- [x] **P4.10** (M2) Check `on_fragile` (nothing rests on a fragile item's top face).
- [x] **P4.11** (M2) Check `liquid_tipped` (vertical size equals the original height).
- [x] **P4.12** (M2) Check `dim_mismatch` (placed size is a permutation of the effective dims, within EPS).
- [x] **P4.13** (M2) Check `missing_item` and `duplicate_item`.
- [x] **P4.14** (M2) Returns **all** violations (not just the first), each with code + unitId.
- [x] **P4.15** (M2) Tests: one failing layout per violation code (9 tests).
- [x] **P4.16** (M2) Tests: exact wall contact and item-to-item contact are allowed.
- [x] **P4.17** (M2) Tests: 50% support → `floating`. 80% support → valid. Support split across two items below is summed.

### 4C. Preparation
- [x] **P4.18** (M2) `prepare.ts`: expand quantities into units (`p-07#1`, `p-07#2`).
- [x] **P4.19** (M2) Sort base dims L ≥ W ≥ H.
- [x] **P4.20** (M2) Apply `MARGIN_INFERRED` **only** when `dimsSource = "inferred"`.
- [x] **P4.21** (M2) Apply padding **only** when fragile or sensitive.
- [x] **P4.22** (M2) Any unknown dimension/weight → `needs_measurement` with product ids. The engine is not run.
- [x] **P4.23** (M2) More than `MAX_UNITS` → input error (clear message).
- [x] **P4.24** (M2) Tests for P4.18–P4.23.

### 4D. Packer
- [x] **P4.25** (M2, →T8) Pre-checks per carton: single unit too large in all rotations → skip `oversize`. Total weight → skip `overweight`.
- [x] **P4.26** (M2) `greedyPlace` over extreme points with the score (z, y, x).
- [x] **P4.27** (M2) Enforces in bounds, no overlap, support, nothing on fragile, liquid rotations.
- [x] **P4.28** (M2) Extreme-point generation + dedupe + drop out-of-carton points.
- [x] **P4.29** (M2) 4 orderings (volume, base area, weight, longest side; all desc), with fragile units always last.
- [x] **P4.30** (M2) Cartons tried in cost order. Candidate chosen by lowest estimated total cost, tie → smaller volume.
- [x] **P4.31** (M2) Search budget `MAX_SEARCH_MS` enforced. Records `candidatesChecked` and per-carton skip reasons.
- [x] **P4.32** (M2) Every candidate layout is passed through the validator. A rejected candidate is counted (`validatorRejections`) with its violations, the next strategy is tried, and the carton's outcome becomes `validator_rejected` if none passes.
- [x] **P4.33** (M2) `no_box` result carries the reasons per carton and the message "No valid carton found within the search budget".
- [x] **P4.34** (M2) Deterministic (no `Math.random`, no time-dependent ordering).
- [x] **P4.35** (M2) Tests: smallest valid carton chosen for a simple order.
- [x] **P4.36** (M2) Tests: oversize → `no_box` (oversize). Overweight → `no_box` (overweight).
- [x] **P4.37** (M2) Tests: fragile item has nothing on top. Liquid stays upright.
- [x] **P4.38** (M2) Tests: determinism (same input → deep-equal output).
- [x] **P4.39** (M2) **Property test:** 200 seeded random orders → every returned layout passes the validator, and `validatorRejections` is 0.
- [x] **P4.40** (M2) Performance test: a 12-unit order completes under `MAX_SEARCH_MS` locally.

### 4E. Naive baseline (evaluation only)
- [x] **P4.41** (M2) `baseline.ts`: volume-desc first-fit over extreme points, 6 rotations, **no** support / fragile / liquid rules, smallest-volume carton first.
- [x] **P4.42** (M2) Not imported by any app route (evaluation scripts only).
- [x] **P4.43** (M2) Test: on a fixture with a fragile item, the baseline can produce a layout the validator rejects (demonstrates the purpose).

### 4F. Cost model
- [x] **P4.44** (M2) `cost.ts`: outer dims, volumetric kg, actual kg (with tare), chargeable kg, shipping, total. All flagged `estimated: true`.
- [x] **P4.45** (M2) Tests: volumetric vs actual switch-over. `ceil` rounding at exact kg boundaries.

### 4G. Instructions
- [x] **P4.46** (M2) `instructions.ar.ts`: Arabic templates (carton line, per-item placement, fragile, liquid, sensitive, estimated warning, void fill).
- [x] **P4.47** (M2) `instructions.ts`: steps generated bottom-to-top from the validated layout.
- [x] **P4.48** (M2) Tests: the fragile wrap step appears for fragile items. "This side up" appears for liquids. The estimated warning appears only for inferred items.

### 4H. Public interface and review
- [x] **P4.49** (M2) `lib/engine/index.ts` exports a single `packOrder(lines, facts, cartons, rates, config) → result + instructions` plus `validateLayout`.
- [x] **P4.50** (M2) Engine has no imports from `lib/db`, `lib/ai`, Next.js, or any network module.
- [x] **P4.51** (M2) Code comments explain the *why* of each rule (for the Q&A walkthrough).
- [ ] **P4.52** (M1) Review PR: M1 can explain the overlap check, the support ratio and the strategies in their own words.
- [x] **P4.53** (M2) Record `MIN_SUPPORT` and `PADDING_CM` assumptions in `docs/decisions.md`.
- [ ] **P4.54** (M2) Update the dashboard. **Gate G4 check.**

---

## Phase 5: AI extraction (Gemini)

**Owner:** M1 · **Reviewer:** M3 · **Target:** Wed morning · **Gate:** G5 · **Spec:** [stack/02](stack/02-gemini-extraction.md)

### 5A. SDK and client
- [x] **P5.1** (M1) Read the `@google/genai` README (googleapis/js-genai). Confirm the exact names for structured output and usage metadata. Note them in stack/02.
- [x] **P5.2** (M1) `lib/ai/client.ts`: `import "server-only"`, a `GoogleGenAI` client from `GEMINI_API_KEY`, model from `GEMINI_MODEL`.
- [x] **P5.3** (M1) Missing key → typed `config_error` (no crash at import time).

### 5B. Schema
- [x] **P5.4** (M1) `lib/ai/schema.ts`: Zod `ProductFactsSchema` (dims, weight, two sources, three flags, confidence, evidence).
- [x] **P5.5** (M1) Gemini response schema derived from the same field list (one source of truth).
- [x] **P5.6** (M1) Enums: source ∈ {page, inferred, unknown}. Confidence ∈ {high, medium, low}. Nullable numbers.

### 5C. Prompt
- [x] **P5.7** (M1) `lib/ai/prompt.ts` with `PROMPT_VERSION = "v1"`.
- [x] **P5.8** (M1) Prompt rules: outer packaging, cm + g, unit conversion (in, lb, kg), Arabic-Indic digits.
- [x] **P5.9** (M1) Rule: page values → `page`; inferable → `inferred` (confidence ≤ medium); no basis → `null` + `unknown`. **"Never invent."**
- [x] **P5.10** (M1) Rule: fragile definition (glass, crystal, ceramic, porcelain, mirror, screen, or unsure if glass → true).
- [x] **P5.11** (M1) Rule: liquid definition (liquid/gel/cream that can leak). Sensitive definition (electronics, batteries).
- [x] **P5.12** (M1) Rule: `evidence` = the shortest phrase used, or what was inferred from.
- [x] **P5.13** (M1) Rule: dims ordered L ≥ W ≥ H.
- [x] **P5.14** (M1) Product name + description are injected as clearly delimited data (not instructions).

### 5D. Extractor
- [x] **P5.15** (M1) `extractFacts(product, deps)`: the `generate` function is injectable for tests.
- [x] **P5.16** (M1) Call with `temperature: 0` and JSON response mode + schema.
- [x] **P5.17** (M1) Parse `response.text` → JSON → Zod `safeParse`. Failure → `parse_error`, facts = unknown.
- [x] **P5.18** (M1) Sanity checks: dims ≤ 0 or > 150 cm → unknown. Weight ≤ 0 or > 30,000 g → unknown.
- [x] **P5.19** (M1) Consistency check: `page` + `low` confidence → downgrade to `inferred`.
- [x] **P5.20** (M1) Empty response → `empty`. Safety block → `blocked`.
- [x] **P5.21** (M1) Token usage read from usage metadata (input, output, thinking if present). Missing fields → 0.
- [x] **P5.22** (M1) `cost_usd` computed from env prices.
- [x] **P5.23** (M1) Returns `{ facts, event }`, where the event has every `extraction_events` field (stack/04).

### 5E. Reliability
- [x] **P5.24** (M1) Timeout per call (~20 s) → `timeout`.
- [x] **P5.25** (M1) Retry on 429/503 up to 2 times with backoff (1 s, 3 s) + jitter. Final 429 → `rate_limited`.
- [x] **P5.26** (M1) Other API errors → `api_error` with `error_code` and a short `error_message` (no secrets, no full prompt).
- [x] **P5.27** (M1) Concurrency limiter (default 2, from P0.12 limits) for extracting multiple products.
- [x] **P5.28** (M1) Fault injection: when `DEMO_MODE=true` and `simulateOutage` is set → throw `simulated_outage` before any network call.

### 5F. Catalog cache
- [x] **P5.29** (M1) `getOrExtractFacts(productIds)`: cached facts with matching `source_hash` are used as-is (cache hit).
- [x] **P5.30** (M1) A stale `source_hash` → re-extract (cache miss).
- [x] **P5.31** (M1) Facts with `origin` `manual` or `ai_corrected` are **never** overwritten by extraction.
- [x] **P5.32** (M1) On success, upsert `product_facts` with `origin='ai'`, model, prompt version, `extracted_at`.
- [x] **P5.33** (M1) On failure, nothing is written to `product_facts` (the event is still written).
- [x] **P5.34** (M1) Returns cache hit/miss counts for the order event.

### 5G. Tests (no network)
- [ ] **P5.35** (M1) Record 6+ real Gemini responses (from AI Studio or a one-off script) into `tests/fixtures/gemini/`.
- [x] **P5.36** (M1) Test: explicit-dims fixture parses correctly.
- [ ] **P5.37** (M1) Test: inches/lb conversion, Arabic-Indic digits (fixture-based).
- [x] **P5.38** (M1) Test: malformed JSON → `parse_error` + unknown.
- [x] **P5.39** (M1) Test: out-of-range values → unknown.
- [x] **P5.40** (M1) Test: `page` + `low` → `inferred`.
- [x] **P5.41** (M1) Test: retry on 429 then success. 3× 429 → `rate_limited`.
- [x] **P5.42** (M1) Test: manual facts are not overwritten. Stale hash triggers re-extraction.
- [x] **P5.43** (M1) Test: simulated outage produces the right event and no network call.

### 5H. Real-model check and review
- [ ] **P5.44** (M1) One-off local run over all 30 products (`trigger='admin'`): zero crashes, every attempt has an event.
- [ ] **P5.45** (M3) Review PR: M3 can explain the fallback chain, the sanity checks and why we validate with Zod.
- [ ] **P5.46** (M1) Update the dashboard. **Gate G5 check.**

---

## Phase 6: Pack pipeline API & actions

**Owner:** M3 (route + events), M1 (extraction wiring) · **Target:** ⛳ Wed 13:00 · **Gate:** G6 · **Spec:** [stack/01](stack/01-nextjs-typescript.md), [stack/06 §1](stack/06-monitoring.md)

### 6A. `POST /api/orders/[id]/pack` (→T10)
- [x] **P6.1** (M3) `await connection()` at the start (per-request), no `runtime`/`dynamic` exports (removed under Cache Components), `maxDuration` set within the Vercel plan limit (P0.22).
- [x] **P6.2** (M3) Generate a `run_id` and a start timer at entry.
- [x] **P6.3** (M3) Unknown order id → 404 with a clear message (still logged as `error` with `error_code='order_not_found'`).
- [x] **P6.4** (M3) Load order items + cartons.
- [x] **P6.5** (M1) `getOrExtractFacts` for all products (P5.29). Time it as `extract_ms`.
- [x] **P6.6** (M3) Every extraction event is written with `run_id` and `trigger='order'`.
- [x] **P6.7** (M3) Any product with unknown facts → status `needs_measurement` with product ids. The engine is not run.
- [x] **P6.8** (M3) Call `packOrder`. Time it as `pack_ms`.
- [x] **P6.9** (M3) Build the response exactly per the stack/01 contract (carton, items with facts + effective dims + placement, instructions, cost, timings, monitoring flag).
- [x] **P6.10** (M3) Write one `order_runs` row with every field (status, carton, counts, cache hits/misses, estimated units, timings, candidates, validator rejections + violations, costs, tokens, cost_usd, versions, error code).
- [x] **P6.11** (M3) Event-write failure → the response still returns the result, with `monitoring.saved = false`, and `monitoring_degraded` is logged to the console.
- [x] **P6.12** (M3) Unexpected exception → status `error`, the run is still logged (best effort), a 500 is returned with `runId`.
- [x] **P6.13** (M3) Structured console logs: `{ runId, stage, ms, status }` per stage (Vercel logs).
- [x] **P6.14** (M3) Accepts `{ simulateOutage: true }` **only** when `DEMO_MODE=true`. Otherwise it is ignored.
- [x] **P6.15** (M3) After writing the run, evaluate the alert rules (P8.x) without blocking the response on failure.

### 6B. `POST /api/runs/[runId]/action`
- [x] **P6.16** (M3) `confirm` → `employee_action='confirmed'`, `action_at=now()`.
- [x] **P6.17** (M3) `edit` → writes `corrections` rows (field, old, new, `prior_origin`) and updates `product_facts` (`origin='ai_corrected'` if it was `ai`, source → `manual` for edited dims/weight).
- [x] **P6.18** (M3) `edit` sets `employee_action='edited'` and returns a hint to re-pack.
- [x] **P6.19** (M3) Input validated with Zod (allowed fields only, positive numbers, booleans).
- [x] **P6.20** (M3) Unknown `runId` → 404.

### 6C. `PATCH /api/products/[id]/facts` (manual measurement)
- [x] **P6.21** (M3) Sets dims/weight with source `manual`, origin `manual` (or `ai_corrected` if previously AI), and writes `corrections`.
- [x] **P6.22** (M3) Validates ranges (same limits as the sanity checks).

### 6D. `POST /api/products/[id]/extract` (admin re-extract)
- [x] **P6.23** (M1) Forces extraction with `trigger='admin'` and respects the never-overwrite-manual rule.
- [x] **P6.24** (M1) Only available when `DEMO_MODE=true` (to keep the public URL safe).

### 6E. `GET /api/monitoring/metrics?window=` (used by Phase 8)
- [x] **P6.25** (M3) Window param validated (`1h|24h|7d|all`). Returns metric values + sample sizes + open alerts. No raw keys.

### 6F. Pipeline tests (fake DB + fake extractor)
- [x] **P6.26** (M3) Happy path: all cached → `box_found`, `cache_misses=0`, one order_run written.
- [x] **P6.27** (M3) Cache miss path: extractor called, extraction event + facts upsert written.
- [x] **P6.28** (M3) `needs_measurement` path. `no_box` path. Unknown order 404.
- [x] **P6.29** (M3) DB write failure → 200 with `monitoring.saved=false`.
- [x] **P6.30** (M3) Simulated outage only when `DEMO_MODE=true`.
- [x] **P6.31** (M3) Action route: confirm and edit write the correct rows.

### 6G. Checkpoint ⛳ (Wed 13:00)
- [ ] **P6.32** (M3) Deploy to a Vercel preview.
- [x] **P6.33** (M1) Call the pack API for **all 20 orders** on the preview. Statuses match expectations (incl. `needs_measurement` and `no_box`). — done on production instead of a preview (2026-10-21)
- [ ] **P6.34** (M3) Rows appear in `order_runs` and `extraction_events` with correct `run_id` links.
- [x] **P6.35** (M3) Uncached order total time recorded (input for the M5 thresholds). — uncached 1589 ms, cached 119–234 ms
- [ ] **P6.36** (ALL) **If the gate fails:** apply the cut list now and record it in Blockers.
- [ ] **P6.37** (M3) Update the dashboard. **Gate G6 check.**

---

## Phase 7: User interface

**Owner:** M2 · **Reviewer:** M3 · **Target:** Wed afternoon · **Gate:** G7 · **Spec:** [stack/01](stack/01-nextjs-typescript.md), [stack/05](stack/05-3d-visualization.md)

### 7A. Shared UI
- [x] **P7.1** (M2) `SourceBadge` (page / inferred "تقديري" / manual / unknown), with consistent colors.
- [x] **P7.2** (M2) Flag chips: fragile, liquid, sensitive (fixed colors).
- [x] **P7.3** (M2) Loading states (skeletons) and error states (Arabic messages + run id for support).
- [x] **P7.4** (M2) Numbers in Western digits with units. Dimensions formatted "30 × 20 × 15 سم".
- [ ] **P7.5** (M2) RTL check: spacing uses logical Tailwind classes. No mirrored layout bugs.
- [ ] **P7.6** (M2) Responsive at phone width (the packer may use a phone or tablet).

### 7B. Orders page (`/orders`)
- [x] **P7.7** (M2, →T12) Input "رقم الطلب" + button "جهّز الطلب".
- [x] **P7.8** (M2) List of seeded orders with item count (click to pack).
- [x] **P7.9** (M2) Demo orders highlighted (from P3.26).
- [x] **P7.10** (M2) `DEMO_MODE` only: "Simulate Gemini outage" toggle, clearly labeled as a demo control.
- [x] **P7.11** (M2) Calls the pack API, then navigates to the result page with `runId`.

### 7C. Result page (`/orders/[id]`)
- [x] **P7.12** (M2) Header: carton id, name, inner dims, big and clear.
- [x] **P7.13** (M2) Products table: name, qty, dims, weight, flags, source badges, confidence, `evidence` on hover/tap.
- [x] **P7.14** (M2) Effective dims shown when a margin or padding was applied ("+15% safety margin", "+padding").
- [x] **P7.15** (M2) Numbered packing instructions (from the API).
- [x] **P7.16** (M2) Estimated cost box: carton, volumetric kg, chargeable kg, shipping, total, all labeled "تقديري".
- [x] **P7.17** (M2) Timing + cache info line (e.g. "2 cached · 1 extracted · 2.0 s").
- [x] **P7.18** (M2) "Monitoring degraded" badge when `monitoring.saved=false`.
- [x] **P7.19** (M2) `needs_measurement` view: lists the products to measure, with an inline measurement form → PATCH facts → re-pack.
- [x] **P7.20** (M2) `no_box` view: the honest message + reasons per carton.
- [x] **P7.21** (M2) `error` view: the message + run id.
- [x] **P7.22** (M2) **Confirm** button → action API → success state.
- [x] **P7.23** (M2) **Edit** per product: form for dims, weight, flags → action API → re-pack button.
- [x] **P7.24** (M2) Run id shown small at the bottom (links to the run trace on the dashboard).

### 7D. 3D view (→T13)
- [x] **P7.25** (M2) `PackingView3D` loaded via `next/dynamic` with `ssr: false`, and a text fallback.
- [x] **P7.26** (M2) Engine (z-up) → three.js (y-up) mapping helper + unit test.
- [x] **P7.27** (M2) Box center = origin + size/2 helper + unit test.
- [x] **P7.28** (M2) Carton drawn as a wireframe. Items as solid boxes with edges.
- [x] **P7.29** (M2) Colors by flag. Estimated items get a dashed outline + label suffix.
- [x] **P7.30** (M2) Hover/tap label with the item name.
- [x] **P7.31** (M2) OrbitControls. The camera fits the carton on load.
- [x] **P7.32** (M2) Step slider: reveals items in placement order, matching the instruction numbers.
- [ ] **P7.33** (M2) Works on a phone browser (touch rotate/zoom).
- [ ] **P7.34** (M2) Visual check with 3 fixture orders on the preview (screenshots in the PR).

### 7E. Catalog page (`/catalog`)
- [x] **P7.35** (M2) Table of `product_facts`: name, dims, weight, flags, sources, confidence, origin, extracted_at.
- [x] **P7.36** (M2) Products without facts are listed as "not extracted yet".
- [x] **P7.37** (M2) Edit/measure action (reuses the edit form).
- [x] **P7.38** (M2) `DEMO_MODE` only: "Re-extract" and "Clear cached facts" buttons per product (for the cache-miss demo).
- [x] **P7.39** (M2) Filter by source (page / inferred / manual / unknown).

### 7F. Accessibility and polish (minimum)
- [x] **P7.40** (M2) All buttons have readable labels. Color is never the only signal (chips have text).
- [x] **P7.41** (M2) Keyboard: the order input submits on Enter.
- [x] **P7.42** (M2) Page titles set per route.
- [x] **P7.43** (M2) No console errors in the browser on the main flow.

### 7G. Verification
- [ ] **P7.44** (M3) Review PR on the preview: full flow for the 3 demo orders.
- [ ] **P7.45** (M1) Try the edit flow: an edit changes the correction rate data (checked in Supabase).
- [ ] **P7.46** (M2) Test on phone width and desktop.
- [ ] **P7.47** (M2) Update the dashboard. **Gate G7 check.**

---

## Phase 8: Monitoring & alerting

**Owner:** M3 · **Reviewer:** M1 · **Target:** Wed afternoon · **Gate:** G8 · **Spec:** [stack/06](stack/06-monitoring.md)

### 8A. Metric computation (`lib/monitoring/metrics.ts`)
- [x] **P8.1** (M3, →T15) Window filter (`1h|24h|7d|all`) and **exclusion of `trigger='eval'`** applied to every metric.
- [x] **P8.2** (M3) Every metric returns `{ value, n, minN, sufficient }`.
- [x] **P8.3** (M3) **M1** AI correction rate (per stack/06 formula).
- [x] **P8.4** (M3) **M2** data-source mix (units by `dims_source`).
- [x] **P8.5** (M3) **M3** validator rejections (sum + breakdown by violation code).
- [x] **P8.6** (M3) **M4** no-carton rate + skip-reason breakdown.
- [x] **P8.7** (M3) **M5** latency p50/p95, split cached (`cache_misses=0`) vs uncached.
- [x] **P8.8** (M3) **M6** Gemini failure rate + breakdown by status.
- [x] **P8.9** (M3) **M7** cost per order (USD) + cache-hit rate.
- [x] **P8.10** (M3) Latency time series for the chart (bucketed by hour or by run).
- [x] **P8.11** (M3) Recent runs list (last 25) for the table.
- [x] **P8.12** (M3) Run trace (`getRunTrace`) for the drill-down view.
- [x] **P8.13** (M3) Tests: each metric from fixture event arrays.
- [x] **P8.14** (M3) Tests: below min n → `sufficient=false`. Eval events excluded.

### 8B. Alert rules (`lib/monitoring/alerts.ts`)
- [x] **P8.15** (M3, →T16) Rule `M3_validator_rejection`: any in 24 h → critical.
- [x] **P8.16** (M3) Rule `M6_gemini_failure_rate`: > 10% of the last 20 extraction events → critical.
- [x] **P8.17** (M3) Rule `M1_correction_rate`: > 20% over the last 30 AI products → warning.
- [ ] **P8.18** (M3) Rule `M5_latency_p95`: uncached > 8 s or cached > 2 s over the last 20 runs → warning. **Re-tune the thresholds with the real numbers from P6.35** and record them in `docs/decisions.md`.
- [x] **P8.19** (M3) Rule `M4_no_box_rate`: > 15% of the last 20 runs → warning.
- [x] **P8.20** (M3) Rule `M2_unknown_share`: > 30% unknown units in 24 h → info.
- [x] **P8.21** (M3) Min-sample guard per rule.
- [x] **P8.22** (M3) Dedup: one open alert per rule.
- [x] **P8.23** (M3) Auto-resolve when the rule evaluates clean.
- [x] **P8.24** (M3) Evaluated after each order run (P6.15) and on dashboard load.
- [x] **P8.25** (M3) Optional webhook POST on open (if `ALERT_WEBHOOK_URL` is set). Skipped for simulated-outage-driven alerts.
- [x] **P8.26** (M3) Tests: fires at threshold + 1, not at threshold. Dedup. Resolve. Min sample.

### 8C. Dashboard page (`/monitoring`)
- [x] **P8.27** (M3) Window selector + visible sample sizes.
- [x] **P8.28** (M3) Alert banner(s): severity color, message, value vs threshold, n, "view events" link.
- [x] **P8.29** (M3) KPI tiles: M1, M6, M5 (p95 cached/uncached), M7 (cost + cache hit).
- [x] **P8.30** (M3) Chart: M5 latency over time (cached vs uncached).
- [x] **P8.31** (M3) Chart: M2 data-source mix (stacked bar).
- [x] **P8.32** (M3) Chart: M6 failures by status (bar).
- [x] **P8.33** (M3) Tile: M3 validator rejections (shows ✓ when 0, red when > 0, with violation codes).
- [x] **P8.34** (M3) Tile: M4 no-carton rate + skip reasons.
- [x] **P8.35** (M3) Recent runs table: time, order, status, carton, ms, source mix, action → click opens the run trace.
- [x] **P8.36** (M3) Run trace view: order run fields + extraction events (evidence, tokens, latency, status) + corrections.
- [x] **P8.37** (M3) "Insufficient data" state for metrics below min n.
- [x] **P8.38** (M3) Empty state when there are no events at all.
- [x] **P8.39** (M3) Each tile has a one-line "what this tells us" tooltip (helps in Q&A).

### 8D. Fault injection demo
- [x] **P8.40** (M3) Toggle wired (P7.10) → pack with `simulateOutage` → `simulated_outage` events written.
- [x] **P8.41** (M3) The M6 critical alert appears on the dashboard after enough failures (check the min sample: may need 2–3 attempts).
- [ ] **P8.42** (M3) Cached products in the same order still pack (verify and note for the demo).
- [ ] **P8.43** (M3) Toggle off → successful run → the alert auto-resolves.
- [x] **P8.44** (M3) Write the 30-second outage demo script in `docs/demo-script.md`.

### 8E. Investigation story
- [ ] **P8.45** (M1+M3) Capture a **real** issue found via the dashboard or eval during development (problem → metric → trace → fix → after numbers).
- [ ] **P8.46** (M1+M3) Write it up in `docs/report/results.md` with real numbers. If none happened, write "none observed" and use the outage demo instead.

### 8F. Verification
- [ ] **P8.47** (M1) Review PR: M1 can explain every tile and what to do when it turns red.
- [ ] **P8.48** (M3) The dashboard shows real Supabase data on the preview.
- [ ] **P8.49** (M3) Update the dashboard. **Gate G8 check.**

---

## Phase 9: Offline evaluation

**Owners:** M1 (extraction), M2 (packing) · **Reviewer:** M3 · **Target:** Wed evening · **Gate:** G9 · **Spec:** [stack/07](stack/07-evaluation.md)

### 9A. Extraction eval (`scripts/eval-extraction.ts`)
- [x] **P9.1** (M1, →T17) Bypasses the cache. `trigger='eval'`. Sequential with a small delay (rate limits).
- [x] **P9.2** (M1) Compares with ground truth after sorting dims L ≥ W ≥ H.
- [x] **P9.3** (M1) Metric: dim accuracy ±1 cm (group A).
- [x] **P9.4** (M1) Metric: weight accuracy ±10% (group A).
- [x] **P9.5** (M1) Metric: inferred dim MAPE (group B).
- [x] **P9.6** (M1) Metric: source correctness (all).
- [x] **P9.7** (M1) Metric: honesty rate (group C returned unknown).
- [x] **P9.8** (M1) Metric: fragile recall + precision.
- [x] **P9.9** (M1) Metric: liquid accuracy. Sensitive accuracy.
- [x] **P9.10** (M1) Metric: parse success rate.
- [x] **P9.11** (M1) Metric: average latency, tokens, cost per product.
- [x] **P9.12** (M1) Holdout metrics reported separately.
- [x] **P9.13** (M1) Writes `eval_runs` (summary) + `eval_results` (per product) + `eval/results/extraction-<date>-<prompt>.json`.
- [x] **P9.14** (M1) Prints a summary table to the console.
- [x] **P9.15** (M1) Run v1 on all 30 products. Results committed. — `eval/results/extraction-2026-10-21-v1.json`, gemini-3.5-flash-lite, 30/30 ok (results file is in the working tree, commit pending)

### 9B. Prompt iteration (→T20)
- [x] **P9.16** (M1) Look at failures on the **non-holdout** set only. Decide on one prompt change, or none. — none: tuning metrics all 100% except inferred MAPE (12.3% dim), no failures to fix
- [x] **P9.17** (M1) If changed: bump `PROMPT_VERSION`, re-run, and commit before/after numbers. — n/a: no change (prompt stays v1)
- [x] **P9.18** (M1) Record the decision and the numbers in `docs/decisions.md`.

### 9C. Margin decision
- [x] **P9.19** (M1+M2) Set `MARGIN_INFERRED` from the inferred MAPE (rounded up). Update `config.ts` and the docs if it changes from 15%. — all-30 MAPE 14.3% rounds up to 15%: unchanged. Holdout 18.2% (4 products) is above 15% and is disclosed
- [x] **P9.20** (M2) Re-run engine tests after any config change. — n/a: no config change; `npm run check` run after the docs update

### 9D. Packing eval (`scripts/eval-packing.ts`)
- [x] **P9.21** (M2, →T18) Runs the engine and the baseline on all 60 fixtures with the same catalog, cost model and budget.
- [x] **P9.22** (M2) Metric: engine layout validity (must be 100%).
- [x] **P9.23** (M2) Metric: known-feasible recall.
- [x] **P9.24** (M2) Metric: impossible-case false claims (must be 0).
- [x] **P9.25** (M2) Metric: baseline invalidity by violation code.
- [x] **P9.26** (M2) Metric: cost difference on jointly-valid fixtures only.
- [x] **P9.27** (M2) Metric: engine runtime p50/p95.
- [x] **P9.28** (M2) Writes `eval_runs` + `eval_results` + `eval/results/packing-<date>-<engine>.json`.
- [x] **P9.29** (M2) Results committed.

### 9E. Evaluation page (`/evaluation`, →T19)
- [x] **P9.30** (M3) Latest extraction run: headline metrics + model + prompt version + date.
- [x] **P9.31** (M3) Latest packing run: headline metrics + engine version + date.
- [x] **P9.32** (M3) Previous run shown next to the latest for before/after comparison.
- [x] **P9.33** (M3) Per-case table (expandable) with pass/fail and details.
- [x] **P9.34** (M3) Honesty note on the page: "Synthetic dataset written by the team. See the report."

### 9F. Verification
- [x] **P9.35** (M3) Review: numbers on the page = numbers in the JSON files = numbers in `docs/report/results.md`. — `/evaluation` reads the JSON (DB first, file fallback via `lib/monitoring/evaluation.ts`); results.md and REPORT.md checked against the JSON. Re-check on the deployed page if `eval_runs` holds an older run
- [ ] **P9.36** (M1) Update the dashboard. **Gate G9 check.**

---

## Phase 10: Deployment, security & hardening

**Owner:** M3 · **Reviewer:** M2 · **Target:** Wed evening · **Gate:** G10 · **Spec:** [stack/09](stack/09-vercel-ci.md)

### 10A. Security checklist
- [x] **P10.1** (M3) No secret in git history: search the repo for key prefixes and `SERVICE_ROLE`. Nothing found.
- [x] **P10.2** (M3) No `NEXT_PUBLIC_` variable holds a secret.
- [x] **P10.3** (M3) `lib/ai`, `lib/db`, `lib/monitoring` all start with `import "server-only"`.
- [ ] **P10.4** (M3) Browser network tab on the main flow: no Gemini or Supabase calls from the client, no keys in responses.
- [ ] **P10.5** (M3) RLS on for every table. The anon key can't read (P2.29 re-checked on production). — partial: anon read verified on Supabase (P2.29); not re-checked via production
- [x] **P10.6** (M3) Admin/demo endpoints (`extract`, clear facts, fault injection) are disabled when `DEMO_MODE` is not `true`.
- [x] **P10.7** (M3) Input validation on every route (Zod). Order size cap (≤ 12 units). Numeric ranges.
- [x] **P10.8** (M3) Error responses never include stack traces, prompts or keys.
- [x] **P10.9** (M3) Product text is treated as data in the prompt (delimited), noted as a prompt-injection consideration in the report.
- [x] **P10.10** (M3) No real personal or customer data anywhere (synthetic only).

### 10B. Abuse and cost protection on the public URL
- [x] **P10.11** (M3) Simple per-IP rate limit on the pack route (in-DB counter or a small token bucket), or documented acceptance of the risk for a 2-day demo.
- [ ] **P10.12** (M3) Gemini spend cap / quota check in Google AI Studio or Cloud console (free tier or a budget alert). — partial: free tier is 20 req/day/model; owner is enabling billing (Paid Tier)
- [x] **P10.13** (M3) Extraction is only triggered for products in the seeded store (no arbitrary text input on the public URL).

### 10C. Production deployment
- [ ] **P10.14** (M3) `main` green. Production deployment succeeded. URL in README. — partial: production live at https://rassah.vercel.app and URL in README, but work is on `integration`, not yet merged to `main`
- [x] **P10.15** (M3) Production env vars double-checked against the matrix. — checked 2026-10-21 against the matrix: Supabase, Gemini (model/prices/key), DEMO_MODE, ENGINE_VERSION, PROMPT_VERSION set for production + preview
- [x] **P10.16** (M3) `/api/health` all green on production. — done 2026-10-21: status ok, database ok, gemini key present, engine-0.2
- [ ] **P10.17** (M3) Supabase project not paused. Note the inactivity rule.
- [ ] **P10.18** (M3) Run `scripts/reset-events.ts` (clean slate for the demo). Keep eval runs.
- [x] **P10.19** (M1, →T21) Pre-warm: extract all 30 products on production (`trigger='admin'`). Facts present for groups A and B. — done 2026-10-21: 30/30 extracted (15 page, 12 inferred, 3 unknown)
- [x] **P10.20** (M3, →T22) Smoke test **all 20 orders** on the production URL. Statuses as expected. Record results in `docs/demo-script.md`. — done 2026-10-21: 17 box_found, 2 needs_measurement, 1 no_box; see demo-script.md
- [ ] **P10.21** (M3) Check Vercel function logs for errors during the smoke test.

### 10D. Resilience
- [x] **P10.22** (M3) Rollback rehearsal: know how to *Promote to Production* the previous deployment. Steps in `docs/demo-script.md`. — steps in demo-script.md (Promote to Production)
- [ ] **P10.23** (M3) Local fallback: `npm run dev` on the demo laptop against production Supabase works.
- [ ] **P10.24** (M3) Recorded 60-second backup video of the full flow (order → result → 3D → dashboard → outage → resolve).
- [ ] **P10.25** (M3) Offline fallback if there is no internet: screenshots of every screen in `docs/report/screens/`.

### 10E. Performance
- [x] **P10.26** (M3) Cached order total time measured on production (target: well under 2 s). — cached 119–234 ms server-side (fra1)
- [x] **P10.27** (M3) Uncached order total time measured on production. Within the function limit with margin. — uncached 1589 ms (Gemini 1205 ms), far below the function limit
- [ ] **P10.28** (M2) 3D view loads in under ~2 s on the demo laptop.
- [ ] **P10.29** (M3) Final M5 alert thresholds set from these numbers (P8.18).

### 10F. Repository final state
- [ ] **P10.30** (M3) README complete: description, live URL, screenshots, getting started, scripts, env vars, architecture link, limitations, team.
- [ ] **P10.31** (M3) All docs links work (no 404s in the GitHub UI).
- [x] **P10.32** (M3) No stray TODOs in critical paths (engine, validator, extractor, pack route).
- [ ] **P10.33** (M3) Update the dashboard. **Gate G10 check.**

---

## Phase 11: Deliverables (report, diagrams, tools log, deck)

**Owner:** ALL (M1 leads report, M2 leads deck, M3 leads diagrams) · **Target:** Wed night · **Gate:** G11

### 11A. Diagrams
- [ ] **P11.1** (M3, →T24) Development flow diagram matches the actual workflow (branches, CI, previews, review, prod, monitoring loop). _CI steps corrected to match `.github/workflows/ci.yml` (incl. validate-data). Still open: confirm Vercel previews per PR and the review rule are what the team actually does._
- [x] **P11.2** (M3) Monitoring flow diagram matches the actual tables, events and alert rules.
- [x] **P11.3** (M3) Architecture diagram matches the actual modules. _Added `lib/pipeline` and the eval scripts / `lib/eval`._
- [x] **P11.4** (M3) All three exported as PNG (mermaid.live) into `docs/report/`. _Rendered with mermaid-cli: `diagram-dev-flow.png`, `diagram-monitoring-flow.png`, `diagram-monitoring-sequence.png`, `diagram-architecture.png`._
- [ ] **P11.5** (M1+M2) Both teammates review that the diagrams match the code.

### 11B. Tools & AI-usage log (`docs/report/TOOLS.md`)
- [x] **P11.6** (ALL) Row per tool: Claude/Claude Code, Gemini API, Google AI Studio, Next.js, Supabase, Vercel, GitHub Actions, Vitest, react-three-fiber, Recharts, Mermaid, any other AI assistant used.
- [x] **P11.7** (ALL) For each: what it did, why it was chosen over alternatives, generated / assisted / manual, how it was verified.
- [x] **P11.8** (ALL) List which files or parts were AI-generated vs hand-written (honest, per module).
- [x] **P11.9** (ALL) Limitations and trade-offs of each AI tool (e.g. Gemini may infer wrongly, mitigated by source tags + margin + eval).

### 11C. Report (`docs/report/REPORT.md` → PDF)
- [ ] **P11.10** (M1, →T23) Title, team, date, live URL, repo URL.
- [ ] **P11.11** (M1) 1. Problem (with the discovery evidence or "no replies yet", stated honestly).
- [ ] **P11.12** (M1) 2. Solution and user flow (with screenshots).
- [x] **P11.13** (M1) 3. Where the AI is and why (LLM understands, engine computes, validator proves).
- [x] **P11.14** (M1) 4. Data collection: the synthetic dataset, how it was built, groups A/B/C, independent ground-truth labeling, holdout.
- [x] **P11.15** (M2) 5. Technical design: architecture, engine rules, validator, cost model (labeled estimates), fallback chain, cache.
- [x] **P11.16** (M3) 6. Development environment: repo, branches, CI, previews, tests, decision log.
- [x] **P11.17** (M3) 7. Selected metrics: the 7 metrics, why each, what each reveals, alert rules.
- [x] **P11.18** (M1+M2) 8. Benchmarks & evaluation results: extraction + packing tables, before/after prompt, margin decision, holdout.
- [ ] **P11.19** (M3) 9. Monitoring in action: the investigation story + the outage demo.
- [ ] **P11.20** (ALL) 10. Tools & AI usage (summary of TOOLS.md).
- [x] **P11.21** (ALL) 11. Limitations (synthetic data, rigid items only, single carton, estimated costs, no live integration, heuristic not optimal).
- [x] **P11.22** (ALL) 12. Next steps (pilot with a merchant, Salla/Zid integration, multi-carton, manufacturer lookup, scale feedback).
- [ ] **P11.23** (ALL) 13. References: brief, Gemini docs, Supabase docs, Vercel docs, Next.js docs, R3F docs, courier volumetric-weight source, Paccurate, bin-packing references actually read.
- [x] **P11.24** (ALL) Diagrams embedded.
- [ ] **P11.25** (ALL) Concise: target ≤ 8–10 pages. Cut anything that isn't evidence.
- [ ] **P11.26** (ALL) Every number in the report traces back to an eval file or the dashboard.
- [ ] **P11.27** (M1) Export to PDF. Check that Arabic text and diagrams render.

### 11D. Pitch deck (3 min)
- [x] **P11.28** (M2, →T25) Slide 1: Title + one-line pitch.
- [x] **P11.29** (M2) Slide 2: Problem (volumetric weight, breakage, missing data).
- [x] **P11.30** (M2) Slide 3: Before / After.
- [x] **P11.31** (M2) Slide 4: How it works (LLM → engine → validator), as a simple diagram.
- [ ] **P11.32** (M2) Slide 5: Live demo placeholder (backup screenshots behind it). _Demo slide is deck slide 6. Still open: no screenshots exist yet (`docs/report/screens/`)._
- [x] **P11.33** (M2) Slide 6: Evaluation numbers (3–4 headline numbers max).
- [ ] **P11.34** (M2) Slide 7: Monitoring (dashboard screenshot + the investigation story in one line). _Investigation line is in (deck slide 8). Still open: a dashboard screenshot from the deployed app replaces the dashed placeholder._
- [x] **P11.35** (M2) Slide 8: Limits + next step (pilot ask).
- [x] **P11.36** (M2) Appendix slides for Q&A: architecture, development flow, monitoring flow, metric definitions, tools table.
- [x] **P11.37** (M2) Speaker assignment: who says what (all 3 speak). _Deck slide 10 + speaker notes on every slide._
- [x] **P11.38** (M2) Exported PDF backup of the deck. _`docs/report/deck.pdf` (image-only, from slide renders). Re-export from PowerPoint once screenshots and the live URL are in._

### 11E. Supporting documents
- [x] **P11.39** (M3) `docs/demo-script.md`: exact clicks for the 3 demo orders + outage story + backup plan.
- [ ] **P11.40** (ALL) `docs/decisions.md` complete (all decisions with reasons).
- [ ] **P11.41** (M1) `docs/discovery.md` final (merchant outreach and replies, honest).
- [ ] **P11.42** (ALL) `docs/report/results.md` final.
- [x] **P11.43** (ALL) Q&A answer sheet: written answers to the PLAN §15 question bank (`docs/qa.md`).

### 11F. Code walkthrough prep (team-participation requirement)
- [ ] **P11.44** (M1) Can walk through `validator.ts` (written by M2).
- [ ] **P11.45** (M2) Can walk through `extractor.ts` + prompt (written by M1).
- [ ] **P11.46** (M3) Can walk through `packer.ts` + `prepare.ts` (written by M2).
- [ ] **P11.47** (M1) Can walk through `metrics.ts` + `alerts.ts` (written by M3).
- [ ] **P11.48** (M2) Can walk through the pack route + event writing (written by M3).
- [ ] **P11.49** (M3) Can walk through the extraction eval (written by M1).

### 11G. Review and submission
- [ ] **P11.50** (ALL) All 3 members read the full report and the deck. Comments resolved.
- [ ] **P11.51** (ALL) Confirm submission format and channel with the instructor (repo link, PDF, deck).
- [ ] **P11.52** (ALL) Update the dashboard. **Gate G11 check.**

---

## Phase 12: Demo-day readiness (Thu 22 Oct)

**Owner:** ALL · **Gate:** G12

### 12A. Rehearsal (Wed night)
- [ ] **P12.1** (ALL, →T26) Rehearsal 1, timed. Note what overran.
- [ ] **P12.2** (ALL) Rehearsal 2, under 3:00.
- [ ] **P12.3** (ALL) Q&A drill: each member answers 6 random questions from `docs/qa.md` about **another** member's lane.
- [ ] **P12.4** (ALL) Practice the outage demo (≤ 30 s).
- [ ] **P12.5** (ALL) Practice the fallback: switch to the backup video within 10 s if the live demo fails.

### 12B. Morning checks (Thu)
- [ ] **P12.6** (M3) Open the Supabase dashboard (wake the project if paused).
- [ ] **P12.7** (M3) `/api/health` all green on production.
- [ ] **P12.8** (M3) Gemini key valid (one admin re-extract on a group-A product succeeds).
- [ ] **P12.9** (M3) Run 3–5 live orders so the dashboard window has fresh data.
- [ ] **P12.10** (M3) Dashboard shows no unexpected open alerts. Resolve leftovers from the rehearsal.
- [ ] **P12.11** (M3) `DEMO_MODE=true` on production. The outage toggle is visible.
- [ ] **P12.12** (M2) Prepare one product with cleared facts for the live cache-miss moment (optional, only if Gemini latency is acceptable).

### 12C. Equipment
- [ ] **P12.13** (M3) Demo laptop charged + charger.
- [ ] **P12.14** (M3) Browser tabs pre-opened: orders, monitoring, evaluation, GitHub repo, deck.
- [ ] **P12.15** (M3) Zoom level set so the judges can read the screen. Notifications off.
- [ ] **P12.16** (M3) Mobile hotspot available as an internet backup.
- [ ] **P12.17** (M3) Backup video + deck PDF stored locally (offline).
- [ ] **P12.18** (M3) Local `npm run dev` fallback tested this morning.
- [ ] **P12.19** (M2) HDMI/USB-C adapter if presenting from your own laptop.

### 12D. Submission
- [ ] **P12.20** (ALL) Repo is public (or shared with the judges) and `main` is the final version.
- [ ] **P12.21** (ALL) Report PDF submitted / linked.
- [ ] **P12.22** (ALL) Deck submitted / linked.
- [ ] **P12.23** (ALL) Live URL + repo URL on the last slide and in the README.

### 12E. During the presentation
- [ ] **P12.24** (ALL) Pitch delivered under 3:00 with all 3 speaking.
- [ ] **P12.25** (ALL) Live demo: quick-success order.
- [ ] **P12.26** (ALL) Live demo: fragile + liquid + estimated order (show badges, instructions, 3D).
- [ ] **P12.27** (ALL) Dashboard + outage story (if time permits within Q&A).
- [ ] **P12.28** (ALL) Honest answers on synthetic data and limitations.

### 12F. After
- [ ] **P12.29** (ALL) Note the judges' feedback in `docs/feedback.md`.
- [ ] **P12.30** (ALL) Final dashboard update. **Gate G12 passed.**

---

## Cut list (apply in order when behind; see PLAN §13)

Never cut: **validator, event logging, tests, honesty about data.**

| Order | Cut | Affected tasks | Applied? |
|---|---|---|---|
| 1 | UI polish | P7.40–P7.43 polish items, styling | ⬜ |
| 2 | 3D view → 2D SVG top + side projections | P7.25–P7.34 | ⬜ |
| 3 | Edit form → only Confirm + Measure for unknown items | P7.23, P6.17–P6.18 | ⬜ |
| 4 | Shipping cost → carton cost + volumetric weight only | P4.44, P7.16 | ⬜ |
| 5 | Packing strategies → one ordering | P4.29 | ⬜ |
| 6 | Evaluation page → results in the report only | P9.30–P9.34 | ⬜ |
| 7 | Rate limit on public URL → documented accepted risk | P10.11 | ⬜ |

---

## Blockers & risks log

| Date/time | ID | Blocker | Owner | Impact | Action | Resolved |
|---|---|---|---|---|---|---|
| 2026-10-21 | B1 | Gemini free tier allows only 20 requests/day/model (429 QuotaFailure); extraction eval runs were mostly rate_limited and discarded | Owner | P9.15-P9.19 (extraction eval, margin decision) cannot complete | Owner enabling billing (Paid Tier), then re-run the eval | Yes (2026-10-21): switched to gemini-3.5-flash-lite (free tier 15 RPM / 500 RPD); eval completed, P9.15-P9.19 done |
| 2026-10-21 | B2 | Supabase DB password not recorded (C7); Supabase and Vercel team invites for M1/M2 not done (P0.16, P0.18, P0.20) | M3 | No direct DB/CLI access; teammates lack dashboard access | Reset/record password in the password manager; send invites | No |

## Sync log

| When | Present | Done since last sync | Next | Blockers |
|---|---|---|---|---|
| Tue 23:00 | | | | |
| Wed 09:00 | | | | |
| Wed 13:00 ⛳ | | | | |
| Wed 18:00 | | | | |
| Wed 23:00 | | | | |
| Thu 08:00 | | | | |

---

## Post-camp backlog (not tracked for Thursday)

- Real Salla/Zid integration (OAuth app, orders + products APIs)
- Manufacturer-spec lookup for branded products (web search tool)
- Similar-product estimation from the catalog (embeddings)
- Multi-carton orders, deformable items, crush-strength / stacking-load rules
- Scale-weight feedback loop (compare actual vs expected weight to flag bad facts)
- Real courier rate APIs instead of the synthetic tariff
- Separate Supabase projects for preview and production
- Authentication and per-merchant data isolation
- Pilot: 100 real orders, operator choice vs Rassah (carton spend, shipping invoices, damage, packing time)

# Stack 04: Supabase (Postgres)

## Why Supabase

- Vercel functions are stateless with no durable disk, so SQLite would lose data between invocations.
- Supabase gives managed Postgres with a free tier, a SQL editor for investigations, and a JS client.
- One store for the mock shop, the AI catalog cache, monitoring events and evaluation results. The dashboard reads real persisted events.

Free-tier caveats (check the Supabase pricing page at setup): limited database size, and projects may **pause after a period of inactivity**. **Open the project the morning of the demo** and run the smoke test.

## Access model

- All DB access happens **server-side** with the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`), through the adapter `lib/db/supabase.ts` (marked `import "server-only"`, client created with `persistSession: false`).
- **RLS is enabled on every table with no public policies.** The anon key can read or write nothing, and it is not shipped to the browser.
- Never prefix Supabase secrets with `NEXT_PUBLIC_`.
- The app talks to the `Repo` interface (`lib/db/repo.ts`). `DATA_BACKEND=memory` swaps in the in-memory backend (`lib/db/memory.ts`, local only); tests use `tests/fakes/memory-repo.ts`.

## Schema: `supabase/migrations/0001_init.sql`

**The migration file is the source of truth**; read it for columns and constraints. It creates 12 tables, all with RLS enabled:

| Group | Tables |
|---|---|
| Mock store (synthetic, modeled on Salla product pages) | `products` (with `source_hash`), `cartons`, `shipping_rates` (single row), `orders` (`demo`, `expect`), `order_items` (qty 1–12) |
| AI catalog cache | `product_facts` (`origin` ∈ `ai`, `manual`, `ai_corrected`; `source_hash` for staleness) |
| Monitoring events | `extraction_events`, `order_runs` (`id` = the request's `run_id`; `strategy`, `unit_sources`, `ai_products` for the M1 denominator, `attempts`, `violations`, `monitoring_degraded`, `employee_action`), `corrections`, `alerts` (`simulated`) |
| Offline evaluation | `eval_runs`, `eval_results` |

Orders placed in `/store` are written to `orders` / `order_items` with `demo = 'store'` and numbers from 5001.

Apply it with the Supabase SQL editor (paste the file) or the Supabase MCP `apply_migration` tool. **Never edit tables by hand without updating the migration.** Add `0002_*.sql` for later changes.

## Seeding: `scripts/seed.ts` (`npm run seed`)

- Reads `data/products.json`, `data/cartons.json`, `data/orders.json` and reads `.env.local`.
- Upserts products (computing `source_hash`), cartons, shipping rates and orders, and replaces the seeded orders' items. Idempotent.
- **Does not** write `product_facts`. Those come from real Gemini extraction or manual entry, never from ground truth. In Supabase, ground truth (`data/ground_truth.json`) is used **only** by the evaluation script. (Memory mode without a Gemini key pre-loads facts from it with origin `seeded`; see the README.)

Other scripts: `scripts/reset-events.ts --yes` (clears events and alerts), `npm run clear-facts -- --product <id>`.

## Investigation queries

Kept in [docs/queries.sql](../queries.sql): failed extractions, failure rate by status, most-corrected products, slowest runs, validator rejections, one run end to end, catalog source mix.

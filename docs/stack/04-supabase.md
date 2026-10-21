# Stack 04: Supabase (Postgres)

**Owner:** M3. **Reviewer:** M2.

## Why Supabase

- Vercel functions are stateless with no durable disk, so SQLite would lose data between invocations.
- Supabase gives managed Postgres with a free tier, a SQL editor for investigations, and a JS client.
- One store for the mock shop, the AI catalog cache, monitoring events and evaluation results. The dashboard reads real persisted events.

Free-tier caveats (check the Supabase pricing page at setup): limited database size, and projects may **pause after a period of inactivity**. **Open the project the morning of the demo** and run the smoke test.

## Access model

- All DB access happens **server-side** with the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`), from `lib/db/server.ts` (marked `import "server-only"`).
- **Enable RLS on every table and create no public policies.** The anon key can then read or write nothing. We don't ship the anon key to the browser at all.
- Never prefix Supabase secrets with `NEXT_PUBLIC_`.

```ts
// lib/db/server.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
```

## Schema: `supabase/migrations/0001_init.sql`

> **The migration file is the source of truth.** The SQL below was the planning draft. The implemented file adds: a single-row `shipping_rates` table; `orders.demo` / `orders.expect`; `order_runs.strategy`, `unit_sources`, `ai_products` (product ids whose facts were AI-extracted at pack time, the M1 denominator), `attempts`; `alerts.simulated`; indexes on `run_id`; and `order_runs.id` supplied by the app (the request's `run_id`).
>
> Code: `lib/db/repo.ts` (interface), `lib/db/supabase.ts` (server-only adapter), `tests/fakes/memory-repo.ts` (in-memory fake for tests). Scripts: `scripts/seed.ts`, `scripts/reset-events.ts --yes`, `scripts/clear-facts.ts --product <id>`.

```sql
-- ===== Mock store (synthetic data modeled on Salla product pages) =====
create table products (
  id           text primary key,              -- 'p-07'
  name         text not null,
  description  text not null,                 -- page text given to Gemini
  url          text,                          -- illustrative only
  category     text,
  source_hash  text not null                  -- sha256(name || description)
);

create table cartons (
  id            text primary key,             -- 'S','M','L','XL','FLAT'
  name          text not null,
  inner_l_cm    numeric not null, inner_w_cm numeric not null, inner_h_cm numeric not null,
  max_weight_g  numeric not null,
  tare_g        numeric not null default 0,
  cost_sar      numeric not null              -- synthetic
);

create table orders (
  id          text primary key,               -- '1045'
  created_at  timestamptz not null default now()
);

create table order_items (
  order_id    text references orders(id) on delete cascade,
  product_id  text references products(id),
  qty         int  not null check (qty between 1 and 12),
  primary key (order_id, product_id)
);

-- ===== AI catalog cache =====
create table product_facts (
  product_id     text primary key references products(id),
  length_cm      numeric, width_cm numeric, height_cm numeric, weight_g numeric,
  dims_source    text not null check (dims_source   in ('page','inferred','manual','unknown')),
  weight_source  text not null check (weight_source in ('page','inferred','manual','unknown')),
  fragile        boolean not null, liquid boolean not null, sensitive boolean not null,
  confidence     text check (confidence in ('high','medium','low')),
  evidence       text,
  origin         text not null check (origin in ('ai','manual','ai_corrected')),
  source_hash    text not null,                -- staleness check
  model          text, prompt_version text,
  extracted_at   timestamptz, updated_at timestamptz not null default now()
);

-- ===== Monitoring events =====
create table extraction_events (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  run_id           uuid,                        -- links to order_runs.id (null for admin/eval)
  trigger          text not null check (trigger in ('order','admin','eval')),
  product_id       text not null,
  status           text not null check (status in ('ok','parse_error','api_error','rate_limited','timeout','blocked','empty','config_error','simulated_outage')),
  latency_ms       int,
  input_tokens     int, output_tokens int, thinking_tokens int,
  cost_usd         numeric,
  model            text, prompt_version text,
  dims_source      text, weight_source text, confidence text,
  fragile          boolean, liquid boolean,
  error_code       text, error_message text
);
create index on extraction_events (created_at desc);

create table order_runs (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  trigger              text not null check (trigger in ('order','eval')),
  order_id             text not null,
  status               text not null check (status in ('box_found','no_box','needs_measurement','error')),
  carton_id            text,
  items_count          int,
  cache_hits           int, cache_misses int,
  estimated_units      int,                     -- units using inferred dims
  extract_ms           int, pack_ms int, total_ms int,
  candidates_checked   int,
  validator_rejections int not null default 0,  -- engine layouts rejected by the validator (should be 0)
  violations           jsonb,                   -- [{code, unitId, cartonId}]
  carton_cost_sar      numeric, shipping_sar numeric, total_sar numeric,
  tokens_total         int, cost_usd numeric,
  engine_version       text, prompt_version text,
  monitoring_degraded  boolean not null default false,
  error_code           text,
  employee_action      text not null default 'pending' check (employee_action in ('pending','confirmed','edited')),
  action_at            timestamptz
);
create index on order_runs (created_at desc);

create table corrections (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  run_id       uuid references order_runs(id),
  product_id   text not null references products(id),
  field        text not null,                   -- 'height_cm', 'fragile', ...
  old_value    text, new_value text,
  prior_origin text not null                    -- 'ai' → counts toward AI correction rate
);

create table alerts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  rule        text not null,                    -- 'M6_gemini_failure_rate'
  severity    text not null check (severity in ('info','warning','critical')),
  value       numeric, threshold numeric, sample_size int,
  message     text,
  resolved_at timestamptz
);

-- ===== Offline evaluation =====
create table eval_runs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  kind           text not null check (kind in ('extraction','packing')),
  model          text, prompt_version text, engine_version text,
  summary        jsonb not null                 -- headline metrics
);

create table eval_results (
  id          uuid primary key default gen_random_uuid(),
  eval_run_id uuid not null references eval_runs(id) on delete cascade,
  case_id     text not null,
  passed      boolean,
  details     jsonb not null
);

-- ===== Lock everything down: server uses service role, which bypasses RLS =====
alter table products          enable row level security;
alter table cartons           enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;
alter table product_facts     enable row level security;
alter table extraction_events enable row level security;
alter table order_runs        enable row level security;
alter table corrections       enable row level security;
alter table alerts            enable row level security;
alter table eval_runs         enable row level security;
alter table eval_results      enable row level security;
```

Apply it with the Supabase SQL editor (paste the file) or the Supabase CLI (`supabase db push`). Keep the file in git as the source of truth. **Never edit tables by hand without updating the migration.** Add `0002_*.sql` for later changes.

## Seeding: `scripts/seed.ts`

- Reads `data/products.json`, `data/cartons.json`, `data/orders.json`.
- Upserts products (computing `source_hash`), cartons, orders and order items.
- **Does not** write `product_facts`. Those must come from real Gemini extraction (or manual entry), never from ground truth. Ground truth (`data/ground_truth.json`) is used **only** by the evaluation script.
- Run with: `npx tsx scripts/seed.ts` (reads `.env.local`).

## Useful investigation queries (keep in `docs/queries.sql`)

```sql
-- Last 20 failed extractions with reasons
select created_at, product_id, status, error_code, error_message
from extraction_events where status <> 'ok' order by created_at desc limit 20;

-- Products the packers corrected most
select product_id, count(*) from corrections where prior_origin = 'ai'
group by product_id order by count(*) desc;

-- Trace one run end to end
select * from order_runs where id = :run_id;
select * from extraction_events where run_id = :run_id;
select * from corrections where run_id = :run_id;
```

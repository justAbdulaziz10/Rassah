# Stack 01: Next.js + TypeScript

**Owner:** M3 (skeleton), M2 (order/result pages). **Reviewers:** M1.

## Why this choice

- Vercel is our hosting target, and Next.js is Vercel's first-class framework. Pages and API live in one project with one deploy.
- One language (TypeScript) for UI, API, engine and scripts.
- Route handlers run server-side, so API keys never reach the browser.

**Known trade-off:** the team is stronger in Python. Mitigations: plain, well-commented code, no advanced type gymnastics, cross-lane reviews, and the Q&A drill (PLAN §11 T26).

## Setup

```bash
npx create-next-app@latest rassah --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
npm i @google/genai @supabase/supabase-js zod recharts @react-three/fiber @react-three/drei three server-only
npm i -D vitest @vitest/coverage-v8 tsx @types/three
```

- Use the latest stable Next.js at setup time. **Pin exact versions** in `package.json` after install (remove `^`) so CI and Vercel build the same thing.
- Node.js: current LTS, declared in `package.json` `"engines"` and matched in Vercel project settings.
- `tsconfig.json`: keep `"strict": true`.

## Folder layout

```
app/
├── layout.tsx                 <html lang="ar" dir="rtl">, IBM Plex Sans Arabic + Reem Kufi via next/font
├── page.tsx                   landing page (hero = real engine output for order 1016, lib/landing/hero-order.json)
├── error.tsx, not-found.tsx
├── (console)/layout.tsx       nav header shared by the working screens (route group, not in the URL)
├── (console)/orders/page.tsx            order queue + "رقم الطلب" lookup
├── (console)/orders/[id]/page.tsx       result: carton, instructions, products, 3D, confirm/edit
├── (console)/notifications/page.tsx     orders that need attention + open system alerts
├── (console)/catalog/page.tsx           product_facts table: source, confidence, flags, edit
├── (console)/monitoring/page.tsx        dashboard (Stack 06)
├── (console)/evaluation/page.tsx        latest eval runs (Stack 07)
├── store/page.tsx, store/order/[id]/page.tsx   built-in demo shop (orders from 5001)
└── api/
    ├── orders/[id]/pack/route.ts          POST: run the full pipeline
    ├── orders/queue/route.ts              GET: order queue and nav counts
    ├── runs/[runId]/action/route.ts       POST: confirm | edit
    ├── runs/[runId]/trace/route.ts        GET: run trace for the dashboard
    ├── products/[id]/facts/route.ts       PATCH: manual correction or measurement; DELETE: clear cached facts (demo only)
    ├── products/[id]/extract/route.ts     POST: force re-extraction (demo only)
    ├── store/checkout/route.ts            POST: place a store order
    ├── monitoring/metrics/route.ts        GET: metrics for a time window
    └── health/route.ts                    GET: app, database and Gemini key status
components/                    PackRunner, PackingView3D + Safe3D + TopView2D (Stack 05), MonitoringDashboard,
                               CatalogTable, FactsForm, Badges (source badge, flag chips, status pill), landing/, store/
lib/
├── ai/          (Stack 02)
├── engine/      (Stack 03)
├── db/          (Stack 04)
├── monitoring/  (Stack 06)
├── pipeline/    pack orchestration, corrections
├── orders/      queue and notifications data
├── integrations/  optional external store Orders API (read-only)
├── store/, landing/, ui/, eval/, bench/, data/
└── env.ts, health.ts, http.ts, rate-limit.ts
proxy.ts                       real 404 for unknown /orders/:id
```

## API contracts

> The authoritative response type is `PackResponse` in `lib/pipeline/pack.ts`. The pipeline is framework-free and unit-tested with the in-memory repo; routes are thin wrappers.
> **Local/offline mode:** `DATA_BACKEND=memory` serves the mock store from `data/*.json` in process memory, with no Supabase needed. It is for development and as a demo-day fallback, and it is ignored on Vercel.

### `POST /api/orders/{id}/pack`

Request body (optional): `{ "simulateOutage": false }` (honored only when `DEMO_MODE=true`).

Response `200`:

```json
{
  "runId": "uuid",
  "status": "box_found",
  "carton": { "id": "M", "name": "وسط M", "innerCm": [30, 20, 15] },
  "items": [
    {
      "unitId": "p-07#1",
      "productId": "p-07",
      "name": "عطر عود 100 مل",
      "facts": { "lengthCm": 6, "widthCm": 6, "heightCm": 15, "weightG": 350,
                 "fragile": true, "liquid": true, "sensitive": false,
                 "dimsSource": "inferred", "weightSource": "inferred", "confidence": "medium" },
      "effectiveCm": [7.9, 7.9, 18.3],
      "placement": { "x": 0, "y": 0, "z": 3, "dx": 7.9, "dy": 7.9, "dz": 18.3 }
    }
  ],
  "instructions": [{ "step": 1, "unitId": null, "text": "…", "notes": [] }],
  "cost": { "cartonSar": 1.6, "volumetricKg": 1.9, "chargeableKg": 1.9, "shippingSar": 21, "totalSar": 22.6, "estimated": true },
  "timings": { "extractMs": 1840, "packMs": 35, "totalMs": 2010 },
  "monitoring": { "saved": true }
}
```

Other statuses:
- `no_box`: no single carton passes within the search budget. `carton` is null and `reason` is set. When a split into several cartons works, `split` holds the boxes (Stack 03).
- `needs_measurement`: at least one product has unknown dimensions or weight. `productsToMeasure` lists them.
- `error` (HTTP 500): unexpected failure. Returns a `runId` so the event can be found.
- `not_found` (HTTP 404): the order id does not exist. It exists only in the API response; the run row is stored with `order_runs.status = 'error'` and `error_code = 'order_not_found'`, because the DB check constraint allows only `box_found | no_box | needs_measurement | error`.

The example above is abridged. The full `PackResponse` also carries `orderId`, `reason`, `attempts`, `productsToMeasure`, `lines`, `cache` (`hits`/`misses`), `errorMessage`, `orderSource` and `split`. `cost` also has `outerCm` and `actualKg`; `volumetricKg` / `chargeableKg` are derived and not stored; `order_runs` keeps `carton_cost_sar`, `shipping_sar`, `total_sar`.

### `POST /api/runs/{runId}/action`

`{ "action": "confirm" }` or `{ "action": "edit", "productId": "p-07", "changes": { "heightCm": 16, "fragile": true } }`

### `PATCH /api/products/{id}/facts`

Body `{ "changes": { … }, "runId"?: "uuid" }`. Manual measurement or correction. Writes `corrections` rows, sets `origin = "ai_corrected"` (facts that came from AI) or `"manual"`, and sources to `manual`.

## Rendering rules

- Server components fetch data. Interactive pieces (`PackingView3D`, forms, charts) are client components (`"use client"`).
- **Next.js 16 with Cache Components** (`cacheComponents: true`, the create-next-app default): do **not** export `runtime` or `dynamic` from routes. Both are removed under Cache Components, and Node.js is already the default runtime. Use only `maxDuration` where needed.
- Anything that must run per request (DB reads, `Date.now()`, `crypto.randomUUID()`) calls `await connection()` from `next/server` first. In pages, async data components sit inside `<Suspense>`. Read `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` before writing pages.
- Error boundaries (`error.tsx`) receive `{ error, retry }` in this version.
- All `lib/ai`, `lib/db`, `lib/monitoring` modules start with `import "server-only";`.

## UI and RTL

- `<html lang="ar" dir="rtl">`. Use Tailwind logical utilities (`ms-*`, `me-*`, `ps-*`, `text-start`) so spacing flips correctly.
- Numbers and dimensions in Western digits with units ("30 × 20 × 15 سم") for readability.
- Fonts: `IBM Plex Sans Arabic` (text) and `Reem Kufi` (display) via `next/font/google`.
- Color meaning is fixed across the app: fragile = amber, liquid = blue, sensitive = purple, estimated value = dashed outline plus a «تقدير» badge.
- Every result screen shows the data source of each value. The packer must always see what was estimated.

## Environment variables

The full list is in the [README](../../README.md#environment-variables) and `.env.example`. All are server-only (never `NEXT_PUBLIC_`); `.env.local` is git-ignored.

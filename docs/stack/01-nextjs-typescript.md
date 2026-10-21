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
├── layout.tsx                 <html lang="ar" dir="rtl">, Arabic + Kufi display fonts via next/font
├── page.tsx                   landing page (hero = real engine output for order 1016, lib/landing/hero-order.json)
├── (console)/layout.tsx       nav header shared by the working screens (route group, not in the URL)
├── (console)/orders/page.tsx            order list + "enter order number" form
├── (console)/orders/[id]/page.tsx       result: carton, instructions, products, 3D, Confirm/Edit
├── (console)/catalog/page.tsx           product_facts table: source, confidence, flags, edit
├── (console)/monitoring/page.tsx        dashboard (Stack 06)
├── (console)/evaluation/page.tsx        latest eval runs (Stack 07)
└── api/
    ├── orders/[id]/pack/route.ts          POST: run the full pipeline
    ├── runs/[runId]/action/route.ts       POST: confirm | edit
    ├── products/[id]/facts/route.ts       PATCH: manual correction or measurement
    ├── products/[id]/extract/route.ts     POST: force re-extraction (admin)
    ├── monitoring/metrics/route.ts        GET: metrics for a time window
    └── health/route.ts                    GET: app + Supabase + Gemini key presence
components/
├── PackingView3D.tsx          client component (Stack 05)
├── SourceBadge.tsx            page / inferred / manual / unknown
├── MetricCard.tsx, AlertBanner.tsx, charts/*
lib/
├── ai/        (Stack 02)
├── engine/    (Stack 03)
├── db/        (Stack 04)
└── monitoring/(Stack 06)
```

## API contracts

> **Implemented.** The authoritative response type is `PackResponse` in `lib/pipeline/pack.ts`. The pipeline is framework-free and unit-tested with the in-memory repo. Routes are thin wrappers: `app/api/orders/[id]/pack`, `runs/[runId]/action`, `runs/[runId]/trace`, `products/[id]/facts` (PATCH; DELETE = demo-only clear), `products/[id]/extract` (demo-only), `monitoring/metrics`, `health`.
> **Local/offline mode:** `DATA_BACKEND=memory` serves the mock store from `data/*.json` in process memory, with no Supabase needed. It is for development and as a demo-day fallback, and it is ignored on Vercel.

### `POST /api/orders/{id}/pack`

Request body (optional): `{ "simulateOutage": false }` (honored only when `DEMO_MODE=true`).

Response `200`:

```json
{
  "runId": "uuid",
  "status": "box_found",
  "carton": { "id": "M", "name": "Medium", "innerCm": [30, 20, 15] },
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
  "instructions": ["…"],
  "cost": { "cartonSar": 1.6, "volumetricKg": 1.9, "chargeableKg": 1.9, "shippingSar": 21, "totalSar": 22.6, "estimated": true },
  "timings": { "extractMs": 1840, "packMs": 35, "totalMs": 2010 },
  "monitoring": { "saved": true }
}
```

Other statuses:
- `no_box`: no carton passes within the search budget. `carton` is null and `reason` is set.
- `needs_measurement`: at least one product has unknown dimensions or weight. The response lists `productIds` to measure.
- `error`: unexpected failure. Returns a `runId` so the event can be found.
- `not_found`: the order id does not exist. It exists only in the API response (`PackResponse.status`); the run row is stored with `order_runs.status = 'error'` and `error_code = 'order_not_found'`, because the DB check constraint allows only `box_found | no_box | needs_measurement | error`.

The example above is abridged. The full `PackResponse` also carries `orderId`, `reason`, `attempts`, `productsToMeasure`, `lines`, `cache` (`hits`/`misses`) and `errorMessage`. `cost.volumetricKg` / `chargeableKg` are derived and not stored; `order_runs` keeps `carton_cost_sar`, `shipping_sar`, `total_sar`.

### `POST /api/runs/{runId}/action`

`{ "action": "confirm" }` or `{ "action": "edit", "productId": "p-07", "changes": { "heightCm": 16, "fragile": true } }`

### `PATCH /api/products/{id}/facts`

Manual measurement or correction. Writes `corrections` rows, sets `origin = "manual"` or `"ai_corrected"`, and sources to `manual`.

## Rendering rules

- Server components fetch data. Interactive pieces (`PackingView3D`, forms, charts) are client components (`"use client"`).
- **Next.js 16 with Cache Components** (`cacheComponents: true`, the create-next-app default): do **not** export `runtime` or `dynamic` from routes. Both are removed under Cache Components, and Node.js is already the default runtime. Use only `maxDuration` where needed.
- Anything that must run per request (DB reads, `Date.now()`, `crypto.randomUUID()`) calls `await connection()` from `next/server` first. In pages, async data components sit inside `<Suspense>`. Read `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` before writing pages.
- Error boundaries (`error.tsx`) receive `{ error, retry }` in this version.
- All `lib/ai`, `lib/db`, `lib/monitoring` modules start with `import "server-only";`.

## UI and RTL

- `<html lang="ar" dir="rtl">`. Use Tailwind logical utilities (`ms-*`, `me-*`, `ps-*`, `text-start`) so spacing flips correctly.
- Numbers and dimensions in Western digits with units ("30 × 20 × 15 سم") for readability.
- Arabic font: `IBM Plex Sans Arabic` or `Noto Sans Arabic` via `next/font/google`.
- Color meaning is fixed across the app: fragile = amber, liquid = blue, sensitive = purple, estimated value = dashed outline plus a "تقديري" badge.
- Every result screen shows the data source of each value. The packer must always see what was estimated.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | server | Gemini auth |
| `GEMINI_MODEL` | server | e.g. a current Flash-tier model id from AI Studio |
| `GEMINI_PRICE_INPUT_PER_M`, `GEMINI_PRICE_OUTPUT_PER_M` | server | USD prices for the cost metric (copy from the official pricing page and note the date) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server | DB access (server only, never `NEXT_PUBLIC_`) |
| `DEMO_MODE` | server | Enables the fault-injection toggle |
| `ALERT_WEBHOOK_URL` | server, optional | Discord/Slack webhook for alerts |
| `ENGINE_VERSION`, `PROMPT_VERSION` | server | Stamped into events for traceability |

Provide `.env.example` with all names and no values. `.env.local` is git-ignored.

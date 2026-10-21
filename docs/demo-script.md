# Demo Script (Thursday 22 Oct 2026)

> Exact clicks for the live demo and the backup plan. Rehearse twice (CHECKLIST P12.1–P12.5).

## Before going on stage

1. `GET /api/health` on the production URL → `database: ok`, `geminiKeyPresent: true`, `demoMode: true`.
2. Catalog pre-warmed (CHECKLIST P10.19): `/catalog` shows facts for groups A and B, and group C as unknown.
3. Run 3–5 orders so the dashboard has fresh data (`/monitoring`, window "آخر ساعة").
4. No unexpected open alerts. Leftovers from the rehearsal resolve after a few clean runs.
5. Tabs open: `/orders`, `/monitoring`, `/evaluation`, GitHub repo, deck.

## Live flow (≈ 90 s)

| Step | Click | Say |
|---|---|---|
| 1 | `/orders` → type **1001** → "جهّز الطلب" | "The packer types an order number." Single book → smallest suitable carton (FLAT). |
| 2 | Back → **1002** | Perfume 50 ml has **no dimensions on its page**. Gemini inferred them ("تقديري" badge, evidence quote). The engine added a 15% safety margin and padding, kept it upright, and put it on top. Show the numbered instructions and the 3D step slider. |
| 3 | On 1002 → "تعديل" on the perfume → change height → save | "If the packer corrects the AI, it is recorded. That correction rate is our main AI-quality metric (M1)." |
| 4 | **1020** | "≈20.5 kg: every carton is too small or too weak. Rassah says so and never invents a layout." |
| 5 | `/monitoring` | Walk 3 tiles: M1 correction rate, M6 Gemini failures, M5 p95 cached vs uncached. Click a run → trace (Gemini call, tokens, timings). |

## Outage story (≈ 30 s, during Q&A if asked)

1. `/catalog` → on **p-16** (perfume 50 ml) click "مسح الكاش" (clears its cached facts).
2. `/orders` → tick **"محاكاة تعطل Gemini"** → order **1002**.
3. Result: "يحتاج قياس" with "تعذّر الاستخراج الآلي". Cached products in the same order were fine.
4. Repeat once or twice until the M6 rule has ≥ 5 recent extraction events with >10% failures. `/monitoring` shows the **critical** banner "(عطل تجريبي)".
5. Untick the toggle → run 1002 again (Gemini re-extracts p-16) → after the next clean runs the alert resolves.
6. Say: "In a real outage the status would be `api_error` or `rate_limited`, and the webhook would notify the team. Simulated alerts never notify."

## Backup plan

| Problem | Do this |
|---|---|
| Vercel down / bad deploy | Vercel → Deployments → previous → *Promote to Production* (instant). |
| Supabase paused or unreachable | Local laptop: `.env.local` with `DATA_BACKEND=memory`, `DEMO_MODE=true`, and the Gemini key → `npm run build && npm start`. Same UI, in-memory data. |
| No internet | Play the recorded backup video (`docs/report/demo.mp4`) and the screenshots in `docs/report/screens/`. |
| Gemini quota hit | Demo only cached orders (all pre-warmed), and explain the M6 metric and alert. |

## Smoke test (Wed night, all 20 orders)

`/orders/1001` … `/orders/1020`, expected outcome per order in `data/orders.json` (`expect`). Record anything unexpected in CHECKLIST → Blockers.

## Production smoke test (2026-10-21, https://rassah.vercel.app, engine-0.2, gemini-3.5-flash-lite, functions in fra1)

All 30 products pre-extracted on production (`trigger='admin'`): 15 page, 12 inferred, 3 unknown (group C, as designed).

| Orders | Result |
|---|---|
| 1001–1005, 1007–1016, 1018, 1019 (17) | `box_found` (1001 → FLAT, 1018 → M, 1003/1013/1019 → XL, rest → L) |
| 1006, 1017 | `needs_measurement` (contain a group-C product with no measurements on the page; the AI does not guess) |
| 1020 | `no_box` (S/FLAT/M/L too small, XL overweight) |

Timings (server `totalMs`): cached orders 119–234 ms after moving functions to fra1 (were 358–1896 ms in iad1). Uncached order 1001 (facts cleared for p-02): 1589 ms total, of which Gemini extraction 1205 ms.

### Rollback (if a deploy breaks the demo)
Vercel → project `rassah` → Deployments → pick the last good production deployment → ⋯ → **Promote to Production**. Or CLI: `vercel promote <deployment-url> --scope abdulazizs-projects-cb679bdc`.

## Demo morning

Run `npm run demo:morning` (needs `.env.local` with the Supabase service-role key). Add `-- --reset` to clear events first (keeps eval runs and product facts).
It checks `/api/health`, the Supabase counts (30 products, 5 cartons, 20 orders, 27+ facts), packs orders 1001, 1002, 1003 and 1020 (expects `no_box`), and confirms 0 open alerts.
Each step prints a check or cross with timing; exit code 1 on any failure. `BASE_URL` overrides the default `https://rassah.vercel.app`.
It never clears facts or calls the admin extract endpoint. Packing writes a few `order_runs`, so run `--reset` last if you want a clean dashboard.

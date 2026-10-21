# Manual checks (2026-10-21)

Browser: Playwright (playwright-core) driving Brave (Chromium) headless on this laptop, because Google Chrome is not installed and the Playwright MCP could not launch. WebGL via SwiftShader.

## P12.18 Offline fallback: PASS
Built and ran `DATA_BACKEND=memory DEMO_MODE=true GEMINI_API_KEY=` (blank key, so no Gemini call) on 127.0.0.1:3457. `/api/health`: `backend: memory, offline: true, seededFacts: 27`.
Drove `/orders` form with 1001 (FLAT 35x25x6, 2 ms) and 1002 (L 40x30x25, 3 cached, 1 ms): result text, 3D canvas (572x384) and `/monitoring` (2 runs, M5 n=2) rendered.
Screenshots: `offline-order-1001.png`, `offline-order-1002.png`, `offline-monitoring.png`. Commands added to `docs/demo-script.md` ("Offline fallback"). Server stopped.

## P7.33 Phone touch: PASS
390x844 @3x, `isMobile`, `hasTouch` (maxTouchPoints 1), iPhone UA, https://rassah.vercel.app, packed 1002 via the form. Canvas 356x320 rendered. A CDP touch drag (12 moves, +144 px x, +36 px y) changed the canvas (PNG 115,133 B -> 133,303 B, bytes differ; the view visibly rotated to a top-down angle).
Screenshots: `phone-1002-before.png`, `phone-1002-after.png`, `phone-1002-canvas-before.png`, `phone-1002-canvas-after.png`.

## P10.28 3D load time: PASS (informational)
`/orders/1002` on production, fresh browser context each run, from navigation start until the canvas element exists plus two animation frames: 3140 ms, 2001 ms, 1752 ms. **Median 2001 ms.** Includes headless software-rendered WebGL and a cold context (run 1 includes TLS/cold edge).

## P7.34 / P7.44 Preview review (PR #1): PASS
Access via Vercel MCP `get_access_to_vercel_url` (share link, expires 2026-10-22 10:06). Full UI flow (form -> result) for 1001 (FLAT 35x25x6, 234 ms), 1002 (L 40x30x25, 150 ms), 1020 (`no_box`, 388 ms; no 3D by design). Screenshots committed to branch `chore/pr-template` at `docs/report/checks/pr1/` (commit 8e896fd, only that branch pushed) and posted in https://github.com/justAbdulaziz10/Rassah/pull/1#issuecomment-6314501966. Temporary worktree removed. Note: `/Users/abdulaziz/Desktop/tweek-pr` (same branch) is now 1 commit behind origin.

## P7.45 Edit flow: PASS
Production, order 1010, item "بخور معمول" (p-21, AI-inferred), height 5 -> 6 cm via the UI "تعديل" form, "حفظ التصحيح وإعادة التجهيز". Row now shows "قياس يدوي".

| | Before | After |
|---|---|---|
| `/api/monitoring/metrics` M1 | value null, corrected 0, reviewed 0 | value 0.333, corrected 1, reviewed 3, byField `{height_cm: 1}` |
| M2 source mix manual | 0 | 2 |
| Supabase `corrections` rows | 0 | 1 (p-21, height_cm, 5 -> 6, prior_origin `ai`) |
| `product_facts` p-21 | height 5, origin `ai` | height 6, dims_source `manual`, origin `ai_corrected` |

Side effect: p-21 in production is now manual 6 cm (only used by order 1010). Re-extract p-21 from /catalog if a pure-AI state is wanted. Gemini calls made: 0.

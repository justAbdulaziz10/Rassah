# 3:00 Pitch script (Thu 22 Oct 2026)

> Split taken from the speaker notes of `docs/report/deck.pptx` (slide numbers below) and the clicks in `docs/demo-script.md`. All three members speak. Numbers come from `docs/report/results.md`. Rehearse twice under 3:00 (CHECKLIST P12.1, P12.2).

## Timing at a glance

| Time | Who | Slide | Block |
|---|---|---|---|
| 0:00-0:10 | M1 | 1 | Hook: what Rassah is |
| 0:10-0:30 | M1 | 2 | The problem (3 reasons) |
| 0:30-0:45 | M1 | 3 | Before and after |
| 0:45-1:00 | M1 | 4 | How it works (3 steps) |
| 1:00-1:50 | M2 | 6 | Live demo: orders 1001 and 1002 |
| 1:50-2:20 | M2 | 7 | Evaluation numbers |
| 2:20-2:40 | M3 | 8 | Monitoring: seven metrics, one trace per run |
| 2:40-2:55 | M3 | 9 | Limits and the ask |
| 2:55-3:00 | M3 | 11 | Thank you, repo and live URL |

Slide 5 (extraction honesty rules) is a Q&A backup, or 10 s inside M1 only if M1 is under time. Slide 10 (team) is shown briefly or skipped. Slides 12-16 are the appendix for Q&A.

## M1 (0:00-1:00): problem and idea

- **0:00-0:10** "Rassah (رصّة): the packer types an order number and gets the cheapest safe carton, instructions and a 3D layout."
- **0:10-0:30** Three problems: volumetric weight bills oversized cartons, items break when packed badly, and product data is free text on store pages, not a clean table. Say plainly: "We didn't interview merchants yet and our data is synthetic, so the size of the problem is our hypothesis."
- **0:30-0:45** Before: guesswork. After: order number in; carton, instructions and 3D layout out; the packer stays in control.
- **0:45-1:00** "Gemini only reads text. The engine searches positions. A validator that shares no code with the engine checks every layout before the packer sees it."

## M2 (1:00-2:20): demo and evaluation

**Live demo, 50 s** (the full flow in `demo-script.md` is about 90 s; in the pitch run only the two orders below).

| Time | Click | Say |
|---|---|---|
| 1:00-1:15 | `/orders` -> type **1001** -> "جهّز الطلب" | Quick success: one book, dimensions on the page, smallest suitable carton (FLAT in the production smoke test). |
| 1:15-1:50 | Back -> **1002** | Fragile + liquid + estimated: a 50 ml perfume with **no dimensions on its page**, a novel and a charger. Gemini inferred the perfume's size ("تقديري" badge, evidence quote); the engine added a 15% margin and padding, kept it upright and put it on top. Show the numbered instructions and the 3D step slider. |

Skip in the pitch (keep for Q&A): the edit/correction click (step 3), order 1020 (step 4), and the `/monitoring` tour (step 5, M3 covers it from slide 8).

**Evaluation, 30 s (slide 7):** "60 seeded fixtures: 40 of 40 engine layouts pass the independent validator, 20 of 20 on the hardest exact-fill cases, zero false claims on impossible orders, and the naive baseline breaks a rule in 20 of 28 layouts. We do not claim savings." Extraction (if asked): parse 100%, dims within 1 cm 100%, honesty 100%, estimated-size error 12.9%.

## M3 (2:20-3:00): monitoring, limits, ask

- **2:20-2:40 (slide 8)** Seven metrics (M1-M7), each tied to a failure it reveals; red means a critical alert rule. One-line investigation: slow cached orders (358-1896 ms), traced to functions in `iad1` vs a Frankfurt database, fixed with `fra1`, now 119-234 ms.
- **2:40-2:55 (slide 9)** Limits plainly: synthetic data, no live Salla/Zid integration, one carton per order, no savings claim yet. The ask: **one merchant, 100 real orders**, so the savings claim can be measured instead of assumed.
- **2:55-3:00 (slide 11)** Thank the judges; repo and live URL (https://rassah.vercel.app) on screen.

## Optional: the outage story (about 30 s, Q&A only)

Steps are in `demo-script.md`: on `/catalog` clear p-16's cache, tick "محاكاة تعطل Gemini" on `/orders`, run **1002**, repeat until the M6 rule has at least 5 recent events with more than 10% failures, then show the critical banner on `/monitoring`; untick the toggle and rerun 1002 to recover. Say: "In a real outage the status would be `api_error` or `rate_limited` and the webhook would notify the team. Simulated alerts never notify."

## Fallback (10 seconds)

Say: **"The live demo is not responding, so I am switching to our recorded run of the full flow."** Then play the backup video immediately (`docs/report/demo.mp4` per `demo-script.md`) and keep narrating the same script. Do not debug on stage. Other fallbacks: Vercel -> Deployments -> previous -> Promote to Production; local `DATA_BACKEND=memory` build; screenshots in `docs/report/screens/`.

## Before going on stage

Run the checklist in `demo-script.md` ("Before going on stage"): `/api/health` shows `database: ok`, catalog pre-warmed, 3-5 recent orders run, no unexpected open alerts, tabs open.

## Open items (could not be verified from the repo)

- `docs/report/demo.mp4` exists (about 43 s, production, full flow incl. outage); it is not the pitch's two-order run, so narrate from the script and practice the switch within 10 s (CHECKLIST P12.5).
- The deck's speaker notes allot 50 s to the demo (slide 6) while `demo-script.md` says about 90 s for the full flow; this script follows the deck.
- Slide 11 notes say to replace the URL with the Vercel production URL; the slide text already shows https://rassah.vercel.app, so just confirm it is the final production URL.
- Deck slide 9 was fixed in the P11.42 sweep (now "finds 20 / 20 exact fills, but time-bounded", matching results.md).

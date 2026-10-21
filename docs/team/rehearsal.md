# Rehearsal aids (P12.1 to P12.5)

> Three aids: (a) Q&A drill, (b) timing sheets for two rehearsals, (c) the two demo routines (outage in 30 s or less, switch to backup video in 10 s or less). Sources: `docs/qa.md` (numbers match `docs/report/results.md`), `docs/PLAN.md` section 10 (lanes), `docs/demo-script.md`, deck speaker notes. Fill the blank cells during the rehearsal. Do not write a time you did not measure.

## (a) Q&A drill: each member answers about another member's lane

Lanes (PLAN section 10): **M1** AI and data (Gemini extraction, dataset, extraction eval). **M2** engine and UI (packer, validator, cost, result page, 3D). **M3** platform and monitoring (Next.js, Supabase, events, dashboard, alerts, Vercel, CI).

Method: the reader asks the question, the answerer speaks up to 20 seconds without notes, the reader checks the short answer below and marks wrong numbers or missing honesty points. "We don't know" is allowed; an invented number is not. Question numbers refer to `docs/qa.md`; C1 to C4 are its "critiques we raised ourselves" in order.

### M1 answers about M2's lane (engine and validator)

| # | Question | Short answer |
|---|---|---|
| Q1 (second half) | Why is the packer AI and not `if/else`? | The packer is a search over positions, rotations and orderings under constraints (classical AI search). Rules alone can't explore that space; the search plus a validator does. |
| Q2 | Why not let Gemini choose the carton? | An LLM can't guarantee collision-free, supported coordinates and answers vary. The LLM understands, the engine computes, the validator proves. |
| Q3 | How do you know a layout is physically valid? | An independent validator that imports nothing from the packer checks bounds, overlap, weight with tare, at least 70% base support, nothing on fragile, liquids upright, every unit placed once. 40 of 40 engine layouts pass in the packing eval, and the 200-order seeded property test passes. |
| Q8 | What does the engine NOT guarantee? | Not the global optimum (time-bounded). It finds 20 of 20 exact-fill fixtures, but that is our own stress test. No crush strength, stacking load or void fill; no deformable items. "No carton" means no single carton was found within the search budget; the engine then suggests a split into up to 4 cartons, each validated (engine-0.3). |
| C3 | "You built the test and passed it." | Fixtures come from a seeded script with witness layouts, the holdout was not used for tuning, and we report the history (recall 3/20, then 15/20, then 20/20). Ground-truth review by another member is still open. |
| C4 | "Did you save money?" | No claim. On the 8 fixtures where engine and baseline are both valid the saving is 0 SAR, by construction. The baseline breaks a rule in 20 of 28 layouts: the value is safety. A pilot would measure savings. |

### M2 answers about M3's lane (platform and monitoring)

| # | Question | Short answer |
|---|---|---|
| Q6 (metrics) | What does each dashboard metric reveal? | M1 correction rate: wrong AI reads. M2 source mix: missing store data. M3 validator rejections: engine bug, must be 0. M4 no-carton rate: catalog or margin mismatch. M5 p95 cached vs uncached: slow Gemini vs slow engine or DB. M6 Gemini failures by status: key, quota, outage, bad output. M7 cost per order and cache hits: cache broken or prompt too long. |
| Q6 (investigation) | Walk us through one investigation. | Cached orders took 358 to 1896 ms on the M5 chart. The `x-vercel-id` header showed functions in `iad1` while Supabase is in Frankfurt. `vercel.json` region `fra1` fixed it: cached orders 119 to 234 ms. (Offline: recall 3/20 traced to fixture `feasible-05`.) |
| Q10 | What if Gemini is down during packing? | Cached products keep working. Uncached ones fail visibly ("يحتاج قياس", "تعذّرت قراءة صفحة المنتج"), the event is logged with its status, M6 above 10% raises a critical alert, and a webhook fires for real outages only. |
| Q11 | Why Supabase, Vercel, TypeScript? | One language for UI, API and engine; serverless has no persistent disk so we need a durable database for events; Vercel for hosting and deploy from GitHub. Trade-off: the team is stronger in Python, mitigated with cross-reviews and walkthroughs. |
| Q12 | What's next after the camp? | Pilot with one merchant (real catalog, 100 orders, packer vs Rassah), live Salla/Zid integration (today only an optional read-only Orders API hook), manufacturer-spec lookup, scale-weight feedback. |
| Q9 | What did AI tools generate, and how did you verify it? | Claude generated most code drafts and the synthetic data (`docs/report/TOOLS.md`). Verified with 227 tests, CI, the evals, an end-to-end API run and screenshots. Gemini is the runtime feature, verified by the extraction eval. |

### M3 answers about M1's lane (AI and data)

| # | Question | Short answer |
|---|---|---|
| Q1 (first half) | Why is extraction AI and not `if/else`? | Gemini reads free-form Arabic and English text, mixed units, Arabic-Indic digits and implicit fragility ("كريستال") that rules can't handle. The instructor confirmed AI APIs meet the requirement and no fine-tuning is needed. |
| Q4 | What happens when a product page has no dimensions? | Gemini infers from clues (ml, pages, pieces) and tags it `inferred`; the engine adds a 15% margin; the UI shows "تقديري" and says check the fit. With no basis it returns `unknown` and the order stops with "needs measurement". Never a silent guess. |
| Q5 | Where does the 15% margin come from? | Inferred-dimension error rounded up: 12.9% over 12 inferred products, so 15%. Holdout (4 products) is 16.1%, above 15%, so we say it is noisy and a real-merchant pilot should re-measure. |
| Q7 | Is the data real? | No. 30 synthetic products in the style of Saudi store pages, ground truth labeled separately, 10-product holdout. Next step: a pilot on a real catalog. |
| C1 | "Is carton choice really a pain?" | Our angle is volumetric shipping, breakage and onboarding new packers. |
| C2 | "Precise geometry on estimated inputs?" | Yes, which is why every estimate is tagged, padded by 15% and shown to the packer; the M2 metric tracks how much of the catalog is estimated. |

Log: date, who drilled whom, missed cards. Date: ______ . Missed: ______ .

## (b) Timing sheets (deck speaker notes; total target 3:00)

Run the full pitch with a stopwatch. "Overran?" = actual is longer than target. Target is the length of the slot in the notes.

### Rehearsal 1: date ______ , room ______

| Block | Speaker | Target | Actual | Overran? |
|---|---|---|---|---|
| Slide 1, title | M1 | 0:10 | | |
| Slide 2, problem | M1 | 0:20 | | |
| Slide 3, before and after | M1 | 0:15 | | |
| Slide 4, how it works | M1 | 0:15 | | |
| Live demo (slide 6) | M2 | 0:50 | | |
| Slide 7, evaluation | M2 | 0:30 | | |
| Slide 8, monitoring | M3 | 0:20 | | |
| Slide 9, limits and ask | M3 | 0:15 | | |
| Slide 11, thank you | M3 | 0:05 | | |
| **Total** | all | **3:00** | | |

### Rehearsal 2: date ______ , room ______

| Block | Speaker | Target | Actual | Overran? |
|---|---|---|---|---|
| Slide 1, title | M1 | 0:10 | | |
| Slide 2, problem | M1 | 0:20 | | |
| Slide 3, before and after | M1 | 0:15 | | |
| Slide 4, how it works | M1 | 0:15 | | |
| Live demo (slide 6) | M2 | 0:50 | | |
| Slide 7, evaluation | M2 | 0:30 | | |
| Slide 8, monitoring | M3 | 0:20 | | |
| Slide 9, limits and ask | M3 | 0:15 | | |
| Slide 11, thank you | M3 | 0:05 | | |
| **Total** | all | **3:00** | | |

Notes: slides 5 and 10 are not in the timed run (slide 5 is a Q&A backup, slide 10 is shown briefly or skipped). The live demo slot is 50 s in the deck notes while `docs/demo-script.md` says about 90 s for the full flow; in the pitch run only orders 1001 and 1002.

## (c) Demo routines

### Outage demo: 30 seconds or less (Q&A only; from `docs/demo-script.md`, "Outage story")

Do the setup before the session, not in the 30 s: `/catalog` and `/orders/1002?outage=1` open in two tabs, `DEMO_MODE=true` on the deployment, window "آخر ساعة" selected on `/monitoring`, no open alerts. Time budget per step is a target to check in rehearsal, not a measurement.

| Step | Action | Budget | Check |
|---|---|---|---|
| 1 | `/catalog`: on **p-16** (perfume 50 ml) click "حذف البيانات المحفوظة". | 5 s | Row shows no saved facts. |
| 2 | Open **`/orders/1002?outage=1`** (there is no on-page switch; the URL flag simulates the outage). | 5 s | Result shows "يحتاج قياس" with "تعذّرت قراءة صفحة المنتج"; cached products in the same order are fine. |
| 3 | Repeat step 2 once or twice until M6 has at least 5 recent extraction events with more than 10% failures. | 10 s | `/monitoring` shows the critical banner "(عطل تجريبي)". |
| 4 | Say: "In a real outage the status would be `api_error` or `rate_limited`, and the webhook would notify the team. Simulated alerts never notify." | 10 s | |
| 5 | After the demo (not in the 30 s): open `/orders/1002` without the flag so Gemini re-extracts p-16; a simulated alert resolves as soon as a Gemini read succeeds again. | n/a | `/monitoring` shows no open alerts. |

If the rehearsal shows this takes longer than 30 s, record the real time here and decide whether to pre-clear p-16's cache before the session. Total target: 30 s. Rehearsal 1: ____ s. Rehearsal 2: ____ s.

### Switch to the backup video: 10 seconds or less

Backup video: `docs/report/demo.mp4` (about 43 s, production, full flow incl. outage). Screenshots: `docs/report/screens/`. Pre-stage before going on stage: the video open in a player on the presenting machine, paused at 0:00, with the screenshots folder in a second window.

| Second | Action |
|---|---|
| 0 | Trigger: any step has shown no result for about 5 s, or an error page appears. Do not retry more than once. |
| 0-3 | Say: "The live demo is not responding, so I am switching to our recorded run of the full flow." |
| 3-7 | Switch to the player (keyboard shortcut agreed in advance) and press play. |
| 7-10 | Keep narrating the demo script over the video. If the video also fails, show the screenshots in `docs/report/screens/`. |

Other failures (Vercel bad deploy, Supabase unreachable, Gemini quota) have their own fixes in `docs/demo-script.md`, "Backup plan". Switch time rehearsal 1: ____ s. Rehearsal 2: ____ s. Target: 10 s or less (CHECKLIST P12.5).

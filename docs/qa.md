# Q&A Answer Sheet

> Short, honest answers to the PLAN §15 question bank plus the critiques we raised against ourselves. Every member rehearses all of them. Numbers come from `docs/report/results.md`.

**1. Why is this AI and not `if/else`?**
Two AI parts. (a) Gemini reads free-form product text in Arabic and English, mixed units, Arabic-Indic digits, and implicit fragility ("كريستال", "خزف"), and returns structured facts with an honest source tag. Rules can't do that reliably. (b) The packer is a search over positions, rotations and orderings under constraints (classical AI search). The instructor confirmed that using AI APIs meets the requirement and that no fine-tuning is needed.

**2. Why not let Gemini choose the carton directly?**
An LLM can't *guarantee* collision-free, supported coordinates, and the same input can give different answers. Our rule: *the LLM understands, the engine computes, the validator proves.*

**3. How do you know a layout is physically valid?**
An independent validator (`lib/engine/validator.ts`) that imports nothing from the packer checks: inside inner dims, no overlap (two boxes overlap only if their intervals overlap on all three axes), weight ≤ limit incl. carton tare, ≥ 70% of each base supported (gravity), nothing resting on a fragile item, liquids upright, every unit placed once. Engine layouts passing it: **40/40** in the packing eval, and every layout in the 200-order seeded property test.

**4. What happens when a product page has no dimensions?**
Gemini infers from clues (ml, pages, pieces) and tags the value `inferred`. The engine then adds a 15% safety margin, the UI shows the source "تقدير" (and "(تقديري)" in the 3D view), and the instructions say "check the fit". With no basis at all, Gemini returns `unknown`, the order stops with "needs measurement", and the packer measures it once. We never guess silently.

**5. Where does the 15% margin come from?**
It is set from the inferred-dimension error (MAPE) in the extraction eval: margin ≈ that error, rounded up. Measured: inferred-dimension MAPE is 12.9% over 12 inferred products (tuning 11.3%, holdout 16.1%; a first run gave 14.3% overall and 18.2% on the holdout, so expect run-to-run LLM variation of about 1-2 points), which rounds up to 15%, so the margin stays. We are open that the holdout (4 products) is above 15% and that this is synthetic data; a real-merchant pilot would re-measure it, and we would raise the margin if the error is higher.

**6. What does each dashboard metric reveal? Walk us through one investigation.**
M1 correction rate → wrong AI reads. M2 source mix → missing store data. M3 validator rejections → engine bug (must be 0). M4 no-carton rate → catalog/margin mismatch. M5 p95 cached vs uncached → slow Gemini vs slow engine/DB. M6 Gemini failures by status → key, quota, outage, bad output. M7 cost/order + cache hit → cache broken or prompt too long. **Investigation:** the packing eval showed known-feasible recall 3/20. We traced fixture `feasible-05` (3 items) and found every score preferred flat orientations, while the exact fit needs a thin item standing on its side. We added "tight" scores and recall went to 15/20 with validity still 100%; a backtracking anchor search (engine-0.2) then reached 20/20. A regression test covers it. (Live demo: the simulated Gemini outage raises the M6 critical alert, and the run trace shows `simulated_outage`.)

**7. Is the data real?**
No. It's synthetic: 30 products written in the style of Saudi store pages, with ground truth labeled separately and a 10-product holdout. We say this openly. The next step is a pilot on a real merchant's catalog.

**8. What does the engine NOT guarantee?**
Not the global optimum (it's time-bounded). It finds all 20 of 20 zero-slack exact-fill test cases (engine-0.2), but that is a stress test on our own fixtures, not proof of optimality. No crush strength, stacking load or void-fill modeling. No deformable items (clothing is out of scope). When no single carton fits, the split into several cartons is a heuristic, not the cheapest possible split. Costs are illustrative, not courier quotes. "No carton found" means "not found within the search budget", not "impossible".

**9. What did AI tools generate, and how did you verify it?**
See `docs/report/TOOLS.md`. Claude generated most code drafts and the synthetic data. We verified with 219 tests, CI, evals, an end-to-end API run, and screenshots. The ground truth needs our independent review. Gemini is the runtime feature, verified by the extraction eval.

**10. What if Gemini is down during packing?**
Cached products keep working. Uncached ones fail visibly ("needs measurement", marked "تعذّرت قراءة صفحة المنتج"), the event is logged with its status, and M6 crosses 10% → critical alert (+ webhook for real outages). The packer can measure manually.

**11. Why Supabase, Vercel, TypeScript?**
Vercel was a team decision (native Next.js hosting; per-PR previews were planned but we ended up deploying production from `main`, with only one preview check). TypeScript gives one language for UI, API and engine on Vercel. Supabase because serverless functions have no persistent disk, and we need durable events for monitoring. Trade-off: the team is stronger in Python, which we mitigated with cross-reviews and code walkthroughs.

**12. What's next after the camp?**
Pilot with one merchant (real catalog, 100 orders, packer vs Rassah), Salla/Zid integration, a cheaper multi-carton split, manufacturer-spec lookup for branded products, scale-weight feedback to catch bad facts.

## Critiques we raised ourselves (be ready)

- **"Is carton choice really a pain?"** Our angle isn't saving cents on cardboard. It's volumetric shipping charges, breakage/returns, and onboarding new packers.
- **"Precise geometry on estimated inputs?"** Yes, and that's why every estimate is tagged, padded and shown. The M2 metric tracks how much of the catalog is estimated.
- **"You built the test and passed it."** Fixtures are generated by a seeded script with witness layouts. Ground truth is drafted by AI and its independent review by another member is still open (`docs/team/ground-truth-review.md`). The holdout isn't used for tuning. And we report the history, including the earlier misses (recall 3/20, then 15/20, before 20/20).
- **"Did you save money?"** In the packing eval, no: 0 SAR on the 8 jointly-valid fixtures, and the baseline mostly fails safety rules instead (20 of 28 layouts). In the head-to-head benchmark (`docs/benchmark.md`, engine-0.3) Rassah is 8.3% cheaper on the 84 orders both pack validly, and never costlier. Prices are synthetic, so we claim no real-world saving until a pilot.

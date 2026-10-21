# Q&A flashcards

> Short versions of `docs/qa.md` (≤ 3 lines each), grouped by lane. Numbers come from `docs/report/results.md`. `docs/qa.md` was brought in line with these numbers in the P11.42 sweep (40/40 layouts, recall 20/20, baseline failing 20/28). Lanes: M1 = AI and data, M2 = engine, M3 = platform and monitoring.

## Drill (P12.3)

Each member answers **6 random questions from another member's lane** (not their own). Method: one person reads the question side only; the answerer speaks for up to 20 seconds, no notes; the reader checks against the card and marks any wrong number or missing honesty point. Re-draw missed cards at the end. Rules: say "we don't know" when we don't; never invent a number. Log who drilled whom and the date in the checklist (P12.3).

---

## Lane M1: AI and data

**Q1. Why is this AI and not `if/else`?**
Gemini reads free-form Arabic/English text (mixed units, Arabic-Indic digits, "كريستال" implying fragile) that rules can't handle; the packer is also a search over positions and rotations. The instructor confirmed AI APIs meet the requirement; no fine-tuning needed.

**Q4. What if a product page has no dimensions?**
Gemini infers from clues (ml, pages, pieces) and tags it `inferred`; the engine adds a 15% margin and the UI shows "تقديري". With no basis it returns `unknown`, the order stops with "needs measurement", and we never guess silently.

**Q5. Where does the 15% margin come from?**
From the extraction eval: margin = inferred-dimension error rounded up. Error is 12.9% over 12 inferred products, so 15%.

**Q5b. Your holdout error is 16.1%, above the 15% margin. Honest answer?**
Yes, the holdout (only 4 inferred products) is 16.1% vs 11.3% on tuning; it is noisy and a first run was 18.2%. We keep 15%, say so openly, and raise to 20% if a real-merchant pilot confirms the higher error.

**Q7. Is the data real?**
No. It is synthetic: 30 products written in the style of Saudi store pages, ground truth labeled separately, 10-product holdout. The ground truth was drafted by Claude and needs independent review (P3.12/P3.16). Next step: a pilot on a real catalog.

**Q13. Why `gemini-3.5-flash-lite` and not a bigger model?**
`gemini-3.8-flash` and `gemini-3.6-flash` had a free tier of 20 requests per day, so eval runs were rate-limited. Flash-lite has 500 requests per day (15 RPM) and fits the 30-call eval and pre-warm. Paid billing in Saudi Arabia needs a reseller (CNTXT), not possible before the demo.

**Q14. Is carton choice really a pain?**
Our angle is volumetric shipping, breakage and onboarding new packers, not cents on cardboard.

**Q15. Precise geometry on estimated inputs?**
Yes, which is why every estimate is tagged, padded by 15% and shown to the packer, and corrections feed the M1 metric.

---

## Lane M2: engine and validator

**Q2. Why not let Gemini choose the carton?**
An LLM can't guarantee collision-free, supported coordinates, and answers vary run to run. The LLM understands, the engine computes, the validator proves.

**Q3. How do you know a layout is physically valid?**
An independent validator (imports nothing from the packer) checks bounds, overlap, weight with tare, 70% base support, nothing on fragile, liquids upright, every unit once. 40 / 40 engine layouts pass in the eval.

**Q8. What does the engine NOT guarantee?**
Not the global optimum (time-bounded search, 1500 ms). No crush strength, stacking load or void-fill modeling, no deformable items. "No carton" means no single carton was found within the search budget; the engine then suggests a split into up to 4 cartons, each searched and validated like a normal answer (engine-0.3). Exact-fill stress cases: 20 / 20 found, but they are a stress test.

**Q16. You built the test and passed it?**
Fixtures come from a seeded script with witness layouts, the ground truth is to be reviewed by another member (`docs/team/ground-truth-review.md`, not yet done), the holdout wasn't used for tuning, and we report failures (engine-0.1 missed 5 of 20 exact-fill cases before the fix).

**Q17. Did you save money?**
No claim. On the 8 fixtures where engine and baseline are both valid, the mean saving is 0 SAR, by construction (both pick the cheapest carton that fits). The baseline breaks a rule in 20 of 28 layouts; the value is safety. A pilot with 100 real orders would measure savings.

---

## Lane M3: platform and monitoring

**Q6. What does each dashboard metric reveal? One investigation.**
M1 correction rate = wrong AI reads; M2 source mix = missing data; M3 validator rejections = engine bug (must be 0); M4 no-carton rate = catalog or margin; M5 latency = slow Gemini vs DB; M6 Gemini failures; M7 cost and cache hits. Story: cached orders took 358-1896 ms because functions ran in `iad1` while Supabase is in Frankfurt; `fra1` gave 119-234 ms.

**Q10. What if Gemini is down during packing?**
Cached products keep working. Uncached ones fail visibly ("يحتاج قياس", "تعذّرت قراءة صفحة المنتج"), the event is logged with its status, and M6 above 10% raises a critical alert (webhook for real outages; simulated ones never notify).

**Q11. Why Supabase, Vercel, TypeScript?**
Vercel gives previews per PR; TypeScript is one language for UI, API and engine; Supabase because serverless has no persistent disk and we need durable events. The team is stronger in Python; we mitigated with cross-reviews and walkthroughs.

**Q12. What's next after the camp?**
Pilot with one merchant (real catalog, 100 orders, packer vs Rassah), live Salla/Zid integration (today only an optional read-only Orders API hook, `lib/integrations/store.ts`), manufacturer-spec lookup, scale-weight feedback.

**Q9. What did AI tools generate and how did you verify it? (all lanes)**
Claude generated most code drafts and the synthetic data (`docs/report/TOOLS.md`). We verified with tests, CI, the evals, an end-to-end API run and screenshots. Gemini is the runtime feature, verified by the extraction eval.

**Q18. Free-tier risk on demo day?**
The free tier is 500 requests per day on Flash-lite and the catalog is pre-warmed, so demo orders are cache hits. If quota is hit, demo only cached orders and explain M6.

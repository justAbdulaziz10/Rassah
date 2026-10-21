# Ground-truth review (P3.12 / P3.16)

> Aid for the independent re-check of `data/ground_truth.json`. The ground truth was drafted by Claude for the team (see the `_note` in that file); it counts only after a member who did not write the product descriptions has checked every row. Generated from `data/ground_truth.json`, `data/products.json` and the per-case details of `eval/results/extraction-2026-10-21-v1.json` (latest run, model `gemini-3.5-flash-lite`, prompt `v1`, created 2026-10-21T07:17:30.400Z). Synthetic data.

## How to review

1. Take the rows in order. Flagged rows come first (11 of 30 flagged), then the unflagged ones. Review **all 30**, not only the flagged rows: agreement with Gemini does not prove the ground truth is right (both could be wrong in the same way).
2. For each product open `data/products.json` and read the full `description` (Arabic or English). Do not look at the model answer first.
3. Decide independently what the outer-package dimensions (cm, natural upright orientation, `heightCm` = vertical side), weight (g), `fragile`, `liquid`, `sensitive` and the source should be:
   - `page`: numbers written on the page (after unit conversion). Truth must equal the text.
   - `inferred`: not written, but a reasonable box size follows from clues (ml, pages, pieces). Check the truth is a realistic size for that product type.
   - `unknown`: no basis. Truth must be null.
4. Compare with the ground-truth cell and the Gemini cell. Write your decision in the **Reviewer decision** column: `truth OK`, `Gemini right (change truth to ...)`, or `both wrong (...)`, plus one short reason.
5. If you change a ground-truth value, tell M1 (holdout rows are `holdout=true`), re-run the scoring and update `docs/report/results.md`; record the disagreement and its resolution in `docs/decisions.md` (P3.16). Do not edit this table's generated columns.

**Flag thresholds used for the check column** (sorted dimensions compared pairwise, as the eval does): `page` source, any dimension off by more than 1 cm; `inferred` source, any dimension off by more than 15 %; weight off by more than 10 %; any difference in `fragile` / `liquid` / `sensitive`; source differs from `expectedDimsSource`; a null on only one side. An inferred-size difference is often just estimation noise, not a labeling error.

| Id | Group | Holdout | Name | Ground truth | Gemini (latest run) | Check | Reviewer decision |
|---|---|---|---|---|---|---|---|
| p-16 | B | no | عطر أو دو بارفان 50 مل | 6×5×12 cm, 250 g, fragile,liquid, src=inferred | 8×6×12 cm, 300 g, fragile,liquid, src=inferred/inferred | dim2 off 33% (>15%); dim3 off 20% (>15%); weight off 20% (>10%) | |
| p-17 | B | no | رواية ساق البامبو | 21×14×2.5 cm, 450 g, none, src=inferred | 14×3×21 cm, 450 g, none, src=inferred/inferred | dim3 off 20% (>15%) | |
| p-19 | B | no | شاحن جداري سريع 20W | 10×6×4 cm, 120 g, sensitive, src=inferred | 5×5×6 cm, 100 g, sensitive, src=inferred/inferred | dim1 off 40% (>15%); dim2 off 17% (>15%); dim3 off 25% (>15%); weight off 17% (>10%) | |
| p-20 | B | no | قهوة مختصة إثيوبية 250 جرام | 15×9×6 cm, 280 g, none, src=inferred | 10×7×15 cm, 250 g, none, src=inferred/page | dim3 off 17% (>15%); weight off 11% (>10%) | |
| p-21 | B | yes | بخور معمول (12 قطعة) | 12×12×4 cm, 150 g, none, src=inferred | 10×10×5 cm, 200 g, none, src=inferred/inferred | dim1 off 17% (>15%); dim2 off 17% (>15%); dim3 off 25% (>15%); weight off 33% (>10%) | |
| p-22 | B | no | قارورة ماء زجاجية 750 مل | 8×8×27 cm, 450 g, fragile, src=inferred | 9×9×25 cm, 500 g, fragile, src=inferred/inferred | weight off 11% (>10%) | |
| p-24 | B | yes | سماعات أذن لاسلكية | 10×8×4 cm, 150 g, sensitive, src=inferred | 10×10×5 cm, 200 g, sensitive, src=inferred/inferred | dim2 off 25% (>15%); dim3 off 25% (>15%); weight off 33% (>10%) | |
| p-25 | B | no | طقم صحون بورسلين (4 قطع) | 29×29×10 cm, 3000 g, fragile, src=inferred | 30×30×10 cm, 2000 g, fragile, src=inferred/inferred | weight off 33% (>10%) | |
| p-26 | B | no | شاي أخضر (100 كيس) | 16×12×8 cm, 250 g, none, src=inferred | 15×8×20 cm, 250 g, none, src=inferred/inferred | dim1 off 25% (>15%); dim2 off 25% (>15%) | |
| p-27 | B | yes | حامل جوال مكتبي معدني | 12×9×5 cm, 200 g, none, src=inferred | 12×8×3 cm, 200 g, none, src=inferred/inferred | dim3 off 40% (>15%) | |
| p-30 | C | no | مجموعة مختارة | – cm, – g, none, src=unknown | – cm, – g, fragile, src=unknown/unknown | fragile: truth False vs Gemini True | |
| p-01 | A | no | عطر عود ملكي 100 مل | 7×7×16 cm, 420 g, fragile,liquid, src=page | 7×7×16 cm, 420 g, fragile,liquid, src=page/page | agree | |
| p-02 | A | no | كتاب فن التفكير الهادئ | 21×14×2 cm, 350 g, none, src=page | 14×2×21 cm, 350 g, none, src=page/page | agree | |
| p-03 | A | yes | مبخرة خزف مزخرفة | 18×12×22 cm, 1200 g, fragile, src=page | 18×12×22 cm, 1200 g, fragile, src=page/page | agree | |
| p-04 | A | no | Power Bank 20000mAh | 15×7.5×2.8 cm, 430 g, sensitive, src=page | 7.5×2.8×15 cm, 430 g, sensitive, src=page/page | agree | |
| p-05 | A | yes | شمعة معطرة في كوب زجاجي | 10.16×10.16×12.7 cm, 499 g, fragile, src=page | 10.16×10.16×12.7 cm, 498.96 g, fragile, src=page/page | agree | |
| p-06 | A | no | كفر جوال سيليكون | 18×10×2 cm, 80 g, none, src=page | 10×2×18 cm, 80 g, none, src=page/page | agree | |
| p-07 | A | no | عسل سدر جبلي 500 جرام | 9×9×13 cm, 850 g, fragile,liquid, src=page | 9×9×13 cm, 850 g, fragile,liquid, src=page/page | agree | |
| p-08 | A | yes | سماعة بلوتوث محمولة | 20×10×10 cm, 650 g, sensitive, src=page | 20×10×10 cm, 650 g, sensitive, src=page/page | agree | |
| p-09 | A | no | طقم كوبين بورسلين | 25×12×11 cm, 900 g, fragile, src=page | 25×12×11 cm, 900 g, fragile, src=page/page | agree | |
| p-10 | A | no | زيت زيتون بكر ممتاز 1 لتر | 8.89×8.89×30.48 cm, 1497 g, fragile,liquid, src=page | 8.89×8.89×30.48 cm, 1496.88 g, fragile,liquid, src=page/page | agree | |
| p-11 | A | no | عبوة دفاتر جامعية (3 دفاتر) | 30×21×3 cm, 1000 g, none, src=page | 30×21×3 cm, 1000 g, none, src=page/page | agree | |
| p-12 | A | yes | ساعة ذكية رياضية | 12×9×8 cm, 300 g, sensitive, src=page | 12×9×8 cm, 300 g, sensitive, src=page/page | agree | |
| p-13 | A | no | علبة تمر خلاص فاخر 1 كجم | 28×20×6 cm, 1150 g, none, src=page | 28×20×6 cm, 1150 g, none, src=page/page | agree | |
| p-14 | A | yes | سيروم فيتامين سي 30 مل | 4×4×12 cm, 120 g, liquid, src=page | 4×4×12 cm, 120 g, liquid, src=page/page | agree | |
| p-15 | A | no | مجفف شعر احترافي | 26×22×10 cm, 1200 g, sensitive, src=page | 26×22×10 cm, 1200 g, sensitive, src=page/page | agree | |
| p-18 | B | yes | زيت أرغان مغربي 30 مل | 4×4×11 cm, 120 g, fragile,liquid, src=inferred | 4.5×4.5×10 cm, 120 g, fragile,liquid, src=inferred/inferred | agree | |
| p-23 | B | no | ماء ورد طائفي 250 مل | 6×6×18 cm, 290 g, liquid, src=inferred | 6×6×18 cm, 300 g, liquid, src=inferred/inferred | agree | |
| p-28 | C | no | هدية فاخرة | – cm, – g, none, src=unknown | – cm, – g, none, src=unknown/unknown | agree | |
| p-29 | C | yes | منتج مختار | – cm, – g, none, src=unknown | – cm, – g, none, src=unknown/unknown | agree | |

Reviewer name: ______  Date: ______  (sign off here when all 30 rows are decided).

# Confirming, correcting and measuring

After a pack the packer either confirms the result, corrects a product's measurement, or measures a product Rassah could not size (`needs_measurement`). A correction is recorded (it drives metric M1), updates the cached facts with origin `manual`, and the next pack of any order with that product uses the corrected value.

## Sub-features

- `action.confirm`: «تأكيد» records the run as confirmed.
- `action.edit`: «تصحيح» → change a field → «احفظ التصحيح وأعد الحساب» records a correction with the old and new value.
- `action.repack`: the next pack uses the corrected facts (`origin: "manual"`).
- `facts.measure`: on a `needs_measurement` result, «إدخال القياس» saves the sides and weight through `PATCH /api/products/<id>/facts` (`components/PackRunner.tsx`), then re-packs. The catalog's «تعديل» / «إدخال القياس» use the same endpoint (`components/CatalogTable.tsx`).

## How to get to it (user POV)

- On an order result page, the confirm button at the bottom.
- «تصحيح» next to a product in the result's product table.
- «إدخال القياس» beside each product the result asks to measure, or on its row in `/catalog`.

## Driving it with verify.sh

Preconditions:

- A run ID from packing order 1001 and one from order 1002 on the same server ([packing.md](packing.md)).

- **Confirm.** `POST $BASE/api/runs/<run 1001>/action` with `{"action":"confirm"}` → 200, `action: "confirmed"`.
- **Correct.** `POST $BASE/api/runs/<run 1002>/action` with `{"action":"edit","productId":"p-16","changes":{"heightCm":<old + 2>}}` → 200, `action: "edited"`, `corrections[0].field: "height_cm"`, `corrections[0].newValue` the new height as a string.
- **Read it back.** Pack 1002 again → `items[]` for `p-16` has `facts.heightCm` equal to the new height and `facts.origin: "manual"`.
- **Measure.** `PATCH $BASE/api/products/p-29/facts` with only `{"changes":{"lengthCm":20}}` → 400 (all three sides required). With all three sides and `weightG` → 200, `facts.dimsSource: "manual"`, `facts.origin: "manual"`, four `corrections`. Same for `p-30`.
- **Read it back.** Pack 1017 again → `status: "box_found"`, and `items[]` for `p-29` and `p-30` have `facts.origin: "manual"`.
- **Proof.** `confirm_1001.body`, `correct_1002.body`, `repack_1002.body`, `measure_p_29.body`, `measure_p_30.body`, `repack_1017.body`.

## Gotchas

- Changing any side requires all three to be known afterwards; a single side on a product with no size is a 400. A partly measured `inferred` size keeps `dimsSource: "inferred"` until all three sides are given.
- `changes` is strict: unknown keys or an empty object are a 400.
- The correction persists for the server's life. Rerunning the drive against the same server starts from the corrected height, so the script reads the old value first instead of hard-coding it.
- Never correct products on production: it changes the shared demo catalog and the M1 metric everyone sees.

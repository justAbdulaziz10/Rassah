# Confirming and correcting a result

After a pack the packer either confirms the result or corrects a product's measurement. A correction is recorded (it drives metric M1), updates the cached facts with origin `manual`, and the next pack of any order with that product uses the corrected value.

## Sub-features

- `action.confirm`: «تأكيد» records the run as confirmed.
- `action.edit`: «تصحيح» → change a field → «احفظ التصحيح وأعد الحساب» records a correction with the old and new value.
- `action.repack`: the next pack uses the corrected facts (`origin: "manual"`).

## How to get to it (user POV)

- On an order result page, the confirm button at the bottom.
- «تصحيح» next to a product in the result's product table.

## Driving it with verify.sh

Preconditions:

- A run ID from packing order 1001 and one from order 1002 on the same server ([packing.md](packing.md)).

- **Confirm.** `POST $BASE/api/runs/<run 1001>/action` with `{"action":"confirm"}` → 200, `action: "confirmed"`.
- **Correct.** `POST $BASE/api/runs/<run 1002>/action` with `{"action":"edit","productId":"p-16","changes":{"heightCm":<old + 2>}}` → 200, `action: "edited"`, `corrections[0].field: "height_cm"`, `corrections[0].newValue` the new height as a string.
- **Read it back.** Pack 1002 again → `items[]` for `p-16` has `facts.heightCm` equal to the new height and `facts.origin: "manual"`.
- **Proof.** `confirm_1001.body`, `correct_1002.body`, `repack_1002.body`.

## Gotchas

- `changes` is strict: unknown keys or an empty object are a 400.
- The correction persists for the server's life. Rerunning the drive against the same server starts from the corrected height, so the script reads the old value first instead of hard-coding it.
- Never correct products on production: it changes the shared demo catalog and the M1 metric everyone sees.

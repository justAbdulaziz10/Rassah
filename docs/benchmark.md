# Head-to-head benchmark: Rassah vs Paccurate vs 3DBinPacking

`npm run bench` packs the same orders with every engine and judges all of them with one yardstick. Script: `scripts/bench.ts`, adapters: `lib/bench/competitors.ts`, adapter tests: `tests/bench/competitors.test.ts`. Latest results: `eval/results/bench-<date>.md`.

## What is compared

| | Paccurate | 3DBinPacking | Rassah |
|---|---|---|---|
| Mixed carton catalog with prices | yes | yes | yes |
| Dimensional-weight shipping in the choice | yes (we pass it in the carton price) | yes (same) | yes |
| Liquids stay upright | yes (`lock-orientation`) | partly (`vr` = no turning) | yes |
| Nothing on top of fragile items | yes (`fragile` + `onTopOnly`) | no rule available | yes |
| Minimum support under every item (no item hanging in the air) | not in the API | not in the API | yes (70% of its base) |
| Product sizes when the store has none | must be entered first | must be entered first | read from the product page, estimated with a margin, or measured once |
| Arabic packing steps for the packer | no | no | yes |
| Independent check of every layout | no | no | yes |

Sources: Paccurate API types (npm `paccurate` 2.4.2, docs.paccurate.io), 3DBinPacking API doc (3dbinpacking.com/en/api-doc), read 2026-10-21.

## Fairness rules

1. **Same input.** Every engine gets the same units (sizes after Rassah's padding and margin), the same cartons, the same weight limits and the same price per carton.
2. **Same price.** A carton's price is its cost plus shipping at the carton's own volumetric weight (`cartonPriceHalalas`). That gives both vendors the dimensional-weight effect through the one price field they both support, and the per-box base fee makes splitting an order cost what it really costs.
3. **Every rule a vendor can express is sent.** A rule it cannot express is listed as unsupported in the report. It is not dropped from the check.
4. **One judge.** Layouts are checked by the Rassah validator (inside the box, no overlap, every item once, liquids upright, nothing on fragile, support, weight). Cost is computed by one cost model (carton + chargeable-weight shipping). The vendors' own cost and fill numbers are not used.
5. **Geometry and rules are reported separately**, so a vendor is not marked wrong only for a rule it was never told about.
6. **Vendor settings:** Paccurate `boxTypeChoiceGoal: lowest-cost` with `itemSort: combined` (its recommended set); 3DBinPacking `optimization_mode: cost`.
7. **Time.** Rassah's time is measured in-process. For the vendors we use the time they report when they report one (Paccurate `packTime`), and also show the round-trip time including network.

## Test sets

- **Fixtures (60):** 20 tight cases with one carton offered and a known layout, 20 impossible cases, 20 random ones (`data/packing_fixtures.json`).
- **Demo orders (18 of 20):** the real demo orders with true sizes. Orders 1006 and 1017 are left out because their products have no known size at all.
- **Random orders (200 by default):** seeded (`--seed`), 1–4 different products, 1–3 of each, full carton catalog.

## Tomorrow: how to run it against the vendors

1. Get keys (the team, not the script, creates the accounts):
   - Paccurate: free key from sign-up at paccurate.io.
   - 3DBinPacking: 14-day trial at 3dbinpacking.com, then username + API key from the profile page.
2. Put them in `.env.local` (gitignored; never in git or chat): `PACCURATE_API_KEY=…`, `BINPACKING_USERNAME=…`, `BINPACKING_API_KEY=…`.
3. Run `npm run bench -- --write`. About 280 requests per vendor, sent one at a time with a short pause. Responses are cached in `eval/bench-cache/` (gitignored), so a re-run costs no quota. `--cache-only` re-scores without any network call.
4. Check the first lines of the output for errors (a wrong key or a changed API shape shows there). The adapter tests show what shapes we expect.
5. The report is written to `eval/results/bench-<date>.md`. Quote numbers only from that file.

## Results so far (no vendor keys yet: Rassah vs a naive packer)

From `eval/results/bench-2026-10-21.md`, 258 feasible cases:

- **Valid layouts:** Rassah 98.4%, naive packer 32.6%. The naive packer breaks the rules on most orders (liquid tipped 117, item on a fragile one 79, item without support 20).
- **Cost** where both are valid (84 orders): Rassah 31.35 SAR vs 34.19 SAR per order, 8.3% less, and never more expensive.
- **Impossible orders:** Rassah never claimed a fit (20/20 said no); the naive packer returned 6 invalid one-box layouts.
- **Speed:** Rassah p50 0.5 ms, p95 68 ms per order on a laptop.
- **Missing sizes:** with no sizes entered by the store, the vendor APIs can pack 0/20 demo orders; Rassah packs 18/20 with no data entry, and the other 2 after one measurement per product.

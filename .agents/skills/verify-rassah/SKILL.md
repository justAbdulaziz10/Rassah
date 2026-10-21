---
name: verify-rassah
description: Drives the Rassah app over HTTP, locally in memory mode or read-only on production, to prove packing, corrections, store checkout, monitoring and the footer. Use when a change touches app/, components/, lib/, proxy.ts or data/.
metadata:
  origin: home-grown
---

# verify-rassah

Surface: HTTP (pages + JSON API) of a Next.js 16 Cache Components app. Harness: `scripts/verify.sh` (curl + node). Read the repo `AGENTS.md` first; this Next.js differs from training data. The feature map is in [features/README.md](features/README.md): one file per user-facing feature with the exact requests and expected results.

## Launch
```
.agents/skills/verify-rassah/scripts/verify.sh local   # build, next start on a free port, drive, stop
.agents/skills/verify-rassah/scripts/verify.sh prod    # GET-only smoke of BASE_URL (default https://rassah.vercel.app)
```
`.claude/skills/verify-rassah` is a symlink to this directory, so either path works.

Local mode runs `DATA_BACKEND=memory DEMO_MODE=true GEMINI_API_KEY= npm run build`, then `next start -H 127.0.0.1 -p <free port>` with the same variables; the ready signal is `/api/health` answering. The blank Gemini key means nothing paid is called: facts are seeded from `data/ground_truth.json`. The script traps EXIT/INT/TERM and kills only the PID it started (never by process name). It never writes `.env.local`.

## Doctor
Built into local mode: the port must be listening and the server PID alive before any drive. Health must report `app: ok`, `backend: memory`, `database: ok`. Memory mode reports `status: degraded` (offline memory backend, seeded facts) by design; prod must report `status: ok`.

## Drive (each check asserts its result; any mismatch exits nonzero)
| Feature | Local | Prod (GET only) |
|---|---|---|
| [Packing](features/packing.md) | 1001 → `FLAT`; 1002 → packs with `p-16` `inferred`; 1017 → `needs_measurement` for `p-29`, `p-30`; 1020 → `no_box` with a split of ≥ 2 cartons; trace of the 1001 run; `/orders/1021` → 404 | `/orders`, `/orders/1001` 200; `/orders/1021` 404 |
| [Corrections](features/corrections.md) | confirm the 1001 run; correct `p-16` height on the 1002 run; re-pack uses it with origin `manual` | none |
| [Store checkout](features/store-checkout.md) | checkout → 201 with order ≥ 5001; it is new in `/api/orders/queue`; it packs; empty name → 400 | `/store` 200 |
| [Monitoring](features/monitoring.md) | `/api/health`, `/api/monitoring/metrics`, `/monitoring`, `/notifications`, `/catalog`, `/evaluation` | health `status: ok`, the same pages, queue counts |
| [Site footer](features/site-footer.md) | repo link (new tab) in `/`, `/orders`, `/store` | same |

Prod mode never POSTs: packing writes events and can call Gemini (paid), and a checkout creates an order every visitor sees. Any real-world side effect needs the user's approval.

## Evidence
`artifacts/verify/rassah/<timestamp>-<mode>/` (git-ignored): every response body, `build.log`, `server.log`. Survives cleanup.

## Gotchas
- The 404 probe is `/orders/1021`. Numbers from 5001 up (store orders, mock history 9001+) pass `proxy.ts` by design, so `/orders/9999` renders the not-found view with status 200.
- `npm run build` overwrites `.next`; do not run while `next dev` or another build uses this checkout.
- Run `npm run check` separately; this skill proves runtime behavior, not lint/types/tests.

## Proven
2026-10-21, on top of commit b03849f: `verify.sh local` passed all 40 checks and `verify.sh prod` passed all 16 against https://rassah.vercel.app. Break test: pointing the repo link in `components/SiteFooter.tsx` at `#` made exactly the `/orders` and `/store` footer checks fail (`"href=…" not in …/orders.body`) while the landing page's own footer passed; restored, product diff empty, local run green again.

Keep this skill and the feature map current with `maintain-verification-skill`.

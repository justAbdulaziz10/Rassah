---
name: verify-rassah
description: Verify the Rassah Next.js app (packing-station demo) by driving the real build over HTTP, locally with DATA_BACKEND=memory or read-only against production https://rassah.vercel.app. Use after any change to app/, lib/, proxy.ts, or data/ to prove routes, the 404 proxy, and the pack API still work.
---

# verify-rassah

Surface: HTTP (pages + JSON API) of a Next.js 16 Cache Components app. Harness: `scripts/verify.sh` (curl + node). Read the repo `AGENTS.md` first; this Next.js differs from training data.

## Launch
```
.claude/skills/verify-rassah/scripts/verify.sh local   # npm run build, next start on a free port, drive, stop
.claude/skills/verify-rassah/scripts/verify.sh prod    # GET-only smoke of BASE_URL (default https://rassah.vercel.app)
```
Local mode runs `DATA_BACKEND=memory npm run build`, then `next start -H 127.0.0.1 -p <free port>`; ready signal is `/api/health` answering. The script traps EXIT/INT/TERM and kills only the PID it started (never by process name). It does not touch `.env.local` secrets beyond what Next loads; blank `GEMINI_API_KEY` first if you want to be certain nothing paid is called.

## Doctor
Built into local mode: the port must be listening and the server PID alive before any drive. Health must report `app: ok`, `backend: memory`, `database: ok`. Memory mode reports `status: degraded` (offline_memory_backend, seeded facts) by design; prod must report `status: ok`.

## Drive (each check asserts its result; any mismatch exits nonzero)
| Check | Expect |
|---|---|
| GET /api/health | 200, JSON per above |
| GET /orders | 200 |
| GET /orders/1001 | 200 |
| GET /orders/9999 | 404 (proxy.ts rewrites unknown ids; Cache Components would otherwise serve 200) |
| POST /api/orders/1001/pack `{}` (local only) | 200, body contains a carton, no `no_box` |
| POST /api/orders/1020/pack `{}` (local only) | 200, body status `no_box` |
| GET /monitoring, /evaluation | 200 |

Prod mode never POSTs: packing uncached orders calls Gemini (paid) and writes events. Any real-world side effect needs the user's approval.

## Evidence
`artifacts/verify/rassah/<timestamp>-<mode>/` (git-ignored): response bodies, `build.log`, `server.log`. Survives cleanup.

## Gotchas
- Prod `/orders/9999` returning 200 means production predates proxy.ts (commit 01d87d6) and has not been redeployed; that is a real failure, not a script bug.
- `npm run build` overwrites `.next`; do not run while `next dev` or another build uses this checkout.
- Run `npm run check` separately; this skill proves runtime behavior, not lint/types/tests.

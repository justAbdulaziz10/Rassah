# Stack 09: Vercel Deployment & CI

**Owner:** M3. **Reviewer:** M2.

## Environments

| Environment | Trigger | URL | Database | Purpose |
|---|---|---|---|---|
| Local | `npm run dev` | localhost:3000 | Supabase (same project), or `DATA_BACKEND=memory` with no database | Development |
| **Preview** | Every push to a PR branch (planned; not used in the workflow as built: only PR #1, a PR template, got a preview, used once for a check on 2026-10-21) | unique `*.vercel.app` per PR | Supabase | Review on a live URL before merge (plan) |
| **Production** | Push to `main` (as built: straight from the local CI gate) | project domain | Supabase | Demo URL |

> One Supabase project serves local, preview and production, so they share data. Events are not tagged by environment; instead events are cleared before the demo (`npm run demo:morning -- --reset`, or `scripts/reset-events.ts --yes`).

## Vercel setup (Phase 0, T2–T3)

1. Vercel → *Add New Project* → import `justAbdulaziz10/Rassah` from GitHub. Framework is auto-detected as Next.js.
2. Settings → Node.js version = the LTS used locally.
3. Settings → Environment Variables: the variables in the [README](../../README.md#environment-variables), except `DATA_BACKEND` and `MEMORY_SEED_FACTS` (local only, ignored on Vercel).
4. All three members get access to the Vercel project and the GitHub repo.
5. `vercel.json` pins functions to `fra1` (Frankfurt), next to the Supabase region `eu-central-1` (`docs/decisions.md`).

## Serverless constraints that shape the design

- Functions are short-lived. **No in-memory cache across requests**, which is why the catalog cache lives in Supabase. (The per-IP rate limiter is in memory, so it is per instance; see the README limitations.)
- Functions have a maximum duration that depends on the plan. Each pack request is kept short: cache, parallel extraction (limit 2), ≤ 12 units, engine budget 1.5 s. The pack and extract routes set `export const maxDuration = 60`.
- Route handlers run on the default **Node.js runtime**. Under Cache Components, do not export `runtime` (Edge is deprecated anyway).
- No writable persistent filesystem, so evaluation scripts run **locally** (or in CI manually), not on Vercel.

## GitHub Actions CI: `.github/workflows/ci.yml`

On pull requests and pushes to `main`, one job runs on Node from `.nvmrc`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run validate-data`, `npm test`, `npm run build`, `npm run eval:packing`. The file is the source of truth.

- CI needs **no secrets**. Tests never call Gemini or Supabase (Stack 08).
- `.nvmrc` holds the Node LTS version (24) so local, CI and Vercel match.
- Branch protection on `main` (GitHub → Settings → Branches): require the `CI / check` status and 1 approving review. **Plan only: this was not enabled.** As built, the gate was local (`agent-ship ci`) before pushing straight to `main`, with GitHub Actions CI re-running after the push (`docs/decisions.md`, 2026-10-21).

## Release and demo checklist

The release and demo-day steps are tracked in [docs/CHECKLIST.md](../CHECKLIST.md) (Phase 10 and Phase 12) and run in [docs/demo-script.md](../demo-script.md) ("Demo morning", smoke test, backup plan, outage story with `/orders/<id>?outage=1` and `DEMO_MODE=true`).

## Rollback

Vercel keeps every deployment. If a bad deploy reaches production during the demo window, use *Promote to Production* on the last good deployment (instant), then fix forward. The exact steps are in [docs/demo-script.md](../demo-script.md) ("Rollback").

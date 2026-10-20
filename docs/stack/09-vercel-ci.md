# Stack 09: Vercel Deployment & CI

**Owner:** M3. **Reviewer:** M2.

## Environments

| Environment | Trigger | URL | Database | Purpose |
|---|---|---|---|---|
| Local | `npm run dev` | localhost:3000 | Supabase (same project, or a second dev project if time allows) | Development |
| **Preview** | Every push to a PR branch | unique `*.vercel.app` per PR | Supabase | Review on a live URL before merge |
| **Production** | Merge to `main` | project domain | Supabase | Demo URL |

> With one Supabase project, preview and production share data. Tag traffic so it can be filtered: set `VERCEL_ENV` (provided by Vercel) into each event as `env` if time allows, or reseed and clear events before the demo (`scripts/reset-events.ts`). Simplest safe choice for 2 days: one project, plus clearing events the morning of the demo.

## Vercel setup (Phase 0, T2–T3)

1. Vercel → *Add New Project* → import `justAbdulaziz10/Rassah` from GitHub. Framework is auto-detected as Next.js.
2. Settings → Node.js version = the LTS used locally.
3. Settings → Environment Variables (Preview **and** Production):
   `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_PRICE_INPUT_PER_M`, `GEMINI_PRICE_OUTPUT_PER_M`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_MODE`, `ENGINE_VERSION`, `PROMPT_VERSION`, optional `ALERT_WEBHOOK_URL`.
4. All three members get access to the Vercel project and the GitHub repo.

## Serverless constraints that shape the design

- Functions are short-lived. **No in-memory cache across requests**, which is why the catalog cache lives in Supabase.
- Functions have a maximum duration that depends on the plan. Keep each pack request short: cache, parallel extraction (limit 2), ≤ 12 units, engine budget 1.5 s. Set `export const maxDuration = …` on the pack route within the plan's limit, and check the current Vercel docs for the value.
- Route handlers that use the Supabase/Gemini SDKs run on the **Node.js runtime** (`export const runtime = "nodejs"`), not Edge.
- No writable persistent filesystem, so evaluation scripts run **locally** (or in CI manually), not on Vercel.

## GitHub Actions CI: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- CI needs **no secrets**. Tests never call Gemini or Supabase (Stack 08).
- Add `.nvmrc` with the Node LTS version so local, CI and Vercel match.
- Branch protection on `main` (GitHub → Settings → Branches): require the `CI / check` status and 1 approving review. Turn it on right after Phase 0 so the scaffold commit isn't blocked.

## Release and demo checklist

**Wednesday night:**
- [ ] `main` green. Production deploy succeeded.
- [ ] Clear demo-polluting events (`scripts/reset-events.ts`). Keep the eval runs.
- [ ] Pre-warm the catalog: extract all 30 products once on production (`trigger='admin'`).
- [ ] Smoke test all 20 orders on the production URL.
- [ ] Record a 60-second backup video of the full demo flow.

**Thursday morning:**
- [ ] Open the Supabase project (free tier may have paused it). Hit `/api/health` → all green.
- [ ] Run 3–5 live orders so the dashboard has fresh data for the demo window.
- [ ] Laptop backup: `npm run dev` works against the same Supabase.
- [ ] `DEMO_MODE=true` is set, so the fault-injection toggle is visible. Rehearse the 30-second outage story.

## Rollback

Vercel keeps every deployment. If a bad deploy reaches production during the demo window, use *Promote to Production* on the last good deployment (instant), then fix forward on a branch.

# Stack 08: Testing & Code Quality

**Owner:** M3 (setup). Each lane writes its own tests. **Reviewer:** everyone.

## Tools

| Tool | Purpose | Command |
|---|---|---|
| TypeScript strict | Catch type errors | `npm run typecheck` → `tsc --noEmit` |
| ESLint (Next.js config) | Lint + React/Next rules | `npm run lint` |
| Vitest | Unit and property tests | `npm test` → `vitest run` |
| Vitest coverage (v8) | Coverage report for `lib/` | `npm run test:coverage` |
| tsx | Run TS scripts (seed, evals) | `npx tsx scripts/<name>.ts` |

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check": "npm run lint && npm run typecheck && npm test",
    "seed": "tsx scripts/seed.ts",
    "eval:extraction": "tsx scripts/eval-extraction.ts",
    "eval:packing": "tsx scripts/eval-packing.ts"
  }
}
```

`npm run check` must pass locally before every push. CI runs the same checks (Stack 09).

> Lint command note: newer Next.js versions may move away from `next lint`. If so, use `eslint .` with the generated flat config. Check what `create-next-app` produced.

## Test strategy

| Layer | Approach | Network? |
|---|---|---|
| `lib/engine/*` | Unit tests + **property test** (random orders → every layout validates) + determinism test | No |
| `lib/ai/*` | Prompt builder, Zod parsing, sanity checks, fallback logic using **recorded Gemini responses** in `tests/fixtures/gemini/` and an injected fake `generate` function | No |
| `lib/monitoring/*` | Metric and alert functions on fixture event arrays | No |
| Route handlers | Pipeline test with fake extractor + in-memory fake DB adapter (`lib/db` behind a small interface) | No |
| Real Gemini | **Only** via `npm run eval:extraction` (costs tokens, not in CI) | Yes |
| UI | Manual check on the Vercel preview for 3 fixture orders before merging UI PRs | — |

**Test list (minimum).** Each must exist before the demo:

Engine (M2):
- [ ] validator: one failing test per violation code (9)
- [ ] validator: boundary contact allowed; 80% support OK; 50% support → `floating`
- [ ] packer: smallest carton chosen; oversize → `no_box`; overweight → `no_box`
- [ ] packer: nothing on top of fragile; liquid stays upright
- [ ] packer: determinism
- [ ] packer: property test (200 seeded random orders), all outputs valid
- [ ] cost: volumetric vs actual switch-over; `ceil` rounding
- [ ] prepare: margin applied only to inferred; padding only to fragile/sensitive; liquid rotations = 2

AI (M1):
- [ ] parses an explicit-dims fixture; converts inches/lb; Arabic-Indic digits
- [ ] malformed JSON → `parse_error`, product treated as `unknown`
- [ ] out-of-range values → `unknown`
- [ ] `page` + `low` confidence → downgraded to `inferred`
- [ ] manual facts are never overwritten by re-extraction
- [ ] stale `source_hash` triggers re-extraction

Monitoring (M3):
- [ ] each metric from fixtures; min-n → "insufficient data"; eval traffic excluded
- [ ] each alert rule fires above threshold, not at it; dedup; auto-resolve
- [ ] event-write failure → `monitoring_degraded = true`, pack still returns 200

## Conventions

- Branch names: `feat/<lane>-<short>`, `fix/<short>`, `docs/<short>`, `eval/<short>`.
- Commit messages: imperative, scoped, e.g. `engine: enforce support ratio in validator`.
- PR description: what changed, how it was tested, screenshots for UI, and eval before/after numbers for prompt or engine changes.
- **No PR merges with a red CI check.** No direct pushes to `main` after Phase 0.
- Code comments explain *why* (e.g. why fragile items go last), not *what*.
- Keep engine functions small and named after the rule they enforce (`checkSupport`, `checkNothingOnFragile`). This makes the Q&A walkthrough easy.

## Decision log

Keep `docs/decisions.md`: one line per decision with the date, the decision, the reason, and the alternatives considered. Examples: margin = 15% (from eval), `MIN_SUPPORT` = 0.7 (assumption), TypeScript over Python (Vercel). The brief asks us to justify tool and technical choices, and this file is the evidence.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Rules and what enforces them

| Rule | Enforced by |
| --- | --- |
| MVP / two-day / Tuwaiq / synthetic-data framing lives in the English README only, never in site copy (`app/`, `components/`, `lib/`). The footer links to the repo instead. | `tests/ui/no-project-framing.test.ts` (runs in `npm test` and CI) |

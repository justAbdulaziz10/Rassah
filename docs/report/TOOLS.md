# Tools & AI Usage Log

The brief requires: which tools we used, what each did, why we chose it over alternatives, which parts were generated / assisted / written manually, and how we verified the output. Add a row whenever a tool is used.

| Tool | Used for | Why this tool | Generated / assisted / manual | How we verified |
|---|---|---|---|---|
| Claude (Claude Code) | Planning docs, idea critique, project scaffold, engine/validator/extractor code drafts, tests | Agentic coding assistant with repo access | Generated, reviewed by the team | Code review by a teammate, unit + property tests, `npm run check`, production build, eval runs |
| create-next-app 16.4 | Project scaffold | Official Next.js starter, Vercel-native | Generated | Build + smoke test of all routes |
| Gemini API | Runtime product-fact extraction | Team has access. Flash tier is fast and cheap. | Product feature | Extraction eval against hand-labeled ground truth |

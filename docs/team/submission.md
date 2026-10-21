# Submission message (draft)

> Draft for the instructor. Review and send it yourself; nothing here has been sent. Check every link opens before sending. The backup video is in the repository (about 43 s), so it has a path and a GitHub link, not a separate upload.

**To:** the instructor
**Subject:** Project 1 submission: Rassah (رصّة), AI packing assistant

Dear [instructor name],

We are submitting our Project 1 work for *AI Product Development and Monitoring*.

**Project:** Rassah (رصّة). A packer types an order number and gets the cheapest safe carton, numbered Arabic packing instructions and a 3D layout. Gemini reads messy Arabic and English product pages, a packing search computes the layout, and an independent validator checks it. Monitoring covers seven metrics with alert rules and a trace for every run.

**Links**

- Repository: https://github.com/justAbdulaziz10/Rassah
- Live app: https://rassah.vercel.app
- Report (PDF): https://github.com/justAbdulaziz10/Rassah/blob/main/docs/report/REPORT.pdf
- Pitch deck (PPTX): https://github.com/justAbdulaziz10/Rassah/blob/main/docs/report/deck.pptx
- Pitch deck (PDF): https://github.com/justAbdulaziz10/Rassah/blob/main/docs/report/deck.pdf
- Backup demo video: `docs/report/demo.mp4` in the repository (https://github.com/justAbdulaziz10/Rassah/blob/main/docs/report/demo.mp4)

**What to know when you read it**

- The data is synthetic (30 products, 20 orders), written by the team. All evaluation numbers are on synthetic data and are in `docs/report/results.md`.
- We do not claim cost savings. The value shown in the evaluation is safety: the naive baseline breaks a packing rule in 20 of 28 layouts, the engine's layouts pass the independent validator 40 of 40.
- The problem size is a hypothesis. Merchant outreach has no replies recorded (`docs/discovery.md`).
- The live app uses the free Gemini tier, so a burst of new products can hit its rate limit; the demo catalog is pre-warmed.

Please tell us if anything fails to open, or if you need another format.

Thank you,
[names of M1, M2, M3]
Tuwaiq Academy

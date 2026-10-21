// Extraction evaluation (docs/stack/07 §2): runs the REAL Gemini extractor on all 30 products,
// bypassing the cache, and compares with hand-written ground truth. Costs tokens.
// Writes eval/results/extraction-<date>-<prompt>.json, plus eval_runs/eval_results in Supabase
// when configured. Holdout products are reported separately.
// Usage: npm run eval:extraction   (needs GEMINI_API_KEY and GEMINI_MODEL in .env.local)

import fs from "node:fs";
import path from "node:path";
import { extractFacts } from "../lib/ai/extractor";
import { makeGeminiGenerate } from "../lib/ai/gemini";
import { PROMPT_VERSION } from "../lib/ai/prompt";
import { loadGroundTruth, loadProducts } from "../lib/data/load";
import { score, type CaseResult } from "../lib/eval/extraction-score";
import { hasSupabaseEnv, must, scriptSupabase } from "./_supabase";

const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 1500); // stay under free-tier rate limits

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (!apiKey || !model) {
    console.error("GEMINI_API_KEY and GEMINI_MODEL must be set in .env.local to run the extraction eval.");
    process.exit(1);
  }
  const deps = {
    generate: makeGeminiGenerate({ apiKey, model }),
    model,
    promptVersion: PROMPT_VERSION,
    priceInputPerM: Number(process.env.GEMINI_PRICE_INPUT_PER_M ?? 0),
    priceOutputPerM: Number(process.env.GEMINI_PRICE_OUTPUT_PER_M ?? 0),
  };

  const products = loadProducts();
  const truth = new Map(loadGroundTruth().map((t) => [t.productId, t]));
  const cases: CaseResult[] = [];
  for (const [i, p] of products.entries()) {
    const out = await extractFacts({ id: p.id, name: p.name, description: p.description }, deps);
    const t = truth.get(p.id)!;
    cases.push({
      productId: p.id,
      group: p.group,
      holdout: t.holdout,
      status: out.event.status,
      facts: out.facts,
      truth: t,
      latencyMs: out.event.latencyMs,
      tokens: out.event.inputTokens + out.event.outputTokens + out.event.thinkingTokens,
      costUsd: out.event.costUsd,
    });
    process.stdout.write(`${i + 1}/${products.length} ${p.id} ${out.event.status}\n`);
    if (i < products.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const summary = {
    model,
    promptVersion: PROMPT_VERSION,
    all: score(cases),
    tuning: score(cases.filter((c) => !c.holdout)),
    holdout: score(cases.filter((c) => c.holdout)),
  };
  const results = cases.map((c) => ({
    caseId: c.productId,
    passed: c.status === "ok" && c.facts !== null && c.facts.dimsSource === c.truth.expectedDimsSource,
    details: { group: c.group, holdout: c.holdout, status: c.status, facts: c.facts, truth: c.truth, latencyMs: c.latencyMs, tokens: c.tokens },
  }));

  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.join(process.cwd(), "eval", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `extraction-${date}-${PROMPT_VERSION}.json`);
  fs.writeFileSync(file, JSON.stringify({ kind: "extraction", createdAt: new Date().toISOString(), summary, results }, null, 2) + "\n");

  console.log(`\nExtraction evaluation (${model}, prompt ${PROMPT_VERSION})`);
  console.table({ all: summary.all, tuning: summary.tuning, holdout: summary.holdout });
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  console.log("Safety-margin check: ENGINE_CONFIG.marginInferred should be ≥ the inferred dim MAPE above (rounded up).");

  if (hasSupabaseEnv()) {
    const db = scriptSupabase();
    const run = must(
      "eval_runs",
      await db.from("eval_runs").insert({ kind: "extraction", model, prompt_version: PROMPT_VERSION, summary }).select("id"),
    ) as Array<{ id: string }>;
    must(
      "eval_results",
      await db.from("eval_results").insert(results.map((r) => ({ eval_run_id: run[0].id, case_id: r.caseId, passed: r.passed, details: r.details }))),
    );
    console.log(`Stored eval run ${run[0].id} in Supabase.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

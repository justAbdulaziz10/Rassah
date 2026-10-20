import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Repo } from "@/lib/db/repo";
import type { EvalResult, EvalRun } from "@/lib/db/types";

export interface EvalView {
  latest: EvalRun | null;
  previous: EvalRun | null;
  results: EvalResult[];
  source: "database" | "files" | "none";
}

/** Latest two runs of a kind from the database; falls back to committed eval/results/*.json (local only). */
export async function loadEval(repo: Repo | null, kind: EvalRun["kind"], allowFiles: boolean): Promise<EvalView> {
  if (repo) {
    try {
      const runs = await repo.latestEvalRuns(kind, 2);
      if (runs.length > 0) {
        return { latest: runs[0], previous: runs[1] ?? null, results: await repo.getEvalResults(runs[0].id!), source: "database" };
      }
    } catch {
      // fall through to files
    }
  }
  if (allowFiles) {
    const dir = path.join(process.cwd(), "eval", "results");
    try {
      const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${kind}-`) && f.endsWith(".json")).sort();
      const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const toRun = (j: { createdAt: string; summary: Record<string, unknown> }): EvalRun => ({
        kind,
        createdAt: j.createdAt,
        model: (j.summary.model as string) ?? null,
        promptVersion: (j.summary.promptVersion as string) ?? null,
        engineVersion: (j.summary.engineVersion as string) ?? null,
        summary: j.summary,
      });
      if (files.length > 0) {
        const latest = read(files[files.length - 1]);
        const prev = files.length > 1 ? read(files[files.length - 2]) : null;
        return { latest: toRun(latest), previous: prev ? toRun(prev) : null, results: latest.results ?? [], source: "files" };
      }
    } catch {
      // no files
    }
  }
  return { latest: null, previous: null, results: [], source: "none" };
}

import { connection } from "next/server";
import { seededFactsCount } from "@/lib/db/local";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { ENGINE_VERSION } from "@/lib/engine/config";
import { appEnv, hasGeminiKey, hasSupabaseConfig, isLocalBackend } from "@/lib/env";
import { evaluateHealth, type DatabaseState } from "@/lib/health";
import { repoOrError } from "@/lib/http";

// Reports configuration presence and database reachability. Never returns secret values.
// Memory (offline demo) mode answers 200 with status "degraded"; see lib/health.ts.
export async function GET() {
  await connection(); // always evaluate at request time, never prerender

  const local = isLocalBackend();
  let database: DatabaseState = "not_configured";
  if (local || hasSupabaseConfig()) {
    const repo = repoOrError();
    try {
      if (repo instanceof Response) throw new Error("unavailable");
      await repo.ping();
      database = "ok";
    } catch {
      database = "error";
    }
  }

  const env = appEnv();
  const { httpStatus, body } = evaluateHealth({
    backend: local ? "memory" : "supabase",
    database,
    geminiKeyPresent: hasGeminiKey(),
    seededFacts: local && database === "ok" ? seededFactsCount() : 0,
    demoMode: env.DEMO_MODE,
    engineVersion: ENGINE_VERSION,
    promptVersion: PROMPT_VERSION,
  });
  return Response.json(body, { status: httpStatus });
}

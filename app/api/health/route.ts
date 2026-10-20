import { connection } from "next/server";
import { appEnv, hasGeminiKey, hasSupabaseConfig, isLocalBackend } from "@/lib/env";
import { repoOrError } from "@/lib/http";

// Reports configuration presence and database reachability. Never returns secret values.
export async function GET() {
  await connection(); // always evaluate at request time, never prerender

  let database: "ok" | "error" | "not_configured" = "not_configured";
  if (isLocalBackend() || hasSupabaseConfig()) {
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
  const healthy = database === "ok" && hasGeminiKey();
  return Response.json(
    {
      app: "ok",
      backend: isLocalBackend() ? "memory" : "supabase",
      database,
      geminiKeyPresent: hasGeminiKey(),
      demoMode: env.DEMO_MODE,
      engineVersion: env.ENGINE_VERSION,
      promptVersion: env.PROMPT_VERSION,
    },
    { status: healthy ? 200 : 503 },
  );
}

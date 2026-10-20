import { connection } from "next/server";
import { getRepo } from "@/lib/db/supabase";
import { appEnv, hasGeminiKey, hasSupabaseConfig } from "@/lib/env";

// Reports configuration presence and database reachability. Never returns secret values.
export async function GET() {
  await connection(); // always evaluate at request time, never prerender

  let supabase: "ok" | "error" | "not_configured" = "not_configured";
  if (hasSupabaseConfig()) {
    try {
      await getRepo().ping();
      supabase = "ok";
    } catch {
      supabase = "error";
    }
  }

  const env = appEnv();
  const healthy = supabase === "ok" && hasGeminiKey();
  return Response.json(
    {
      app: "ok",
      supabase,
      geminiKeyPresent: hasGeminiKey(),
      demoMode: env.DEMO_MODE,
      engineVersion: env.ENGINE_VERSION,
      promptVersion: env.PROMPT_VERSION,
    },
    { status: healthy ? 200 : 503 },
  );
}

import { connection } from "next/server";
import { appEnv, hasGeminiKey, hasSupabaseConfig } from "@/lib/env";

// Reports configuration presence only. Never returns secret values.
export async function GET() {
  await connection(); // always evaluate at request time, never prerender

  const env = appEnv();
  return Response.json({
    app: "ok",
    demoMode: env.DEMO_MODE,
    engineVersion: env.ENGINE_VERSION,
    promptVersion: env.PROMPT_VERSION,
    geminiKeyPresent: hasGeminiKey(),
    supabaseConfigured: hasSupabaseConfig(),
  });
}

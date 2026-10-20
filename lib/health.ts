// Health verdict, framework-free so it can be unit tested. Reports presence flags only, never values.
//
// Supabase (real) mode: 200 only when the database answers and the Gemini key is present, else 503.
// Memory (offline demo) mode: the app is fully usable without network or a Gemini key, so it answers
// 200 with status "degraded" and the reasons, instead of a 503 that would read as "down". A database
// failure still returns 503 in either mode.

export type DatabaseState = "ok" | "error" | "not_configured";

export interface HealthInput {
  backend: "memory" | "supabase";
  database: DatabaseState;
  geminiKeyPresent: boolean;
  /** Products with offline-seeded facts (memory backend only). */
  seededFacts: number;
  demoMode: boolean;
  engineVersion: string;
  promptVersion: string;
}

export type HealthStatus = "ok" | "degraded" | "error";

export interface HealthBody {
  app: "ok";
  status: HealthStatus;
  backend: "memory" | "supabase";
  /** true when running on the in-memory offline backend (local only, never on Vercel). */
  offline: boolean;
  degraded: string[];
  database: DatabaseState;
  geminiKeyPresent: boolean;
  seededFacts: number;
  demoMode: boolean;
  engineVersion: string;
  promptVersion: string;
}

export function evaluateHealth(input: HealthInput): { httpStatus: 200 | 503; body: HealthBody } {
  const offline = input.backend === "memory";
  const degraded: string[] = [];
  if (offline) degraded.push("offline_memory_backend");
  if (!input.geminiKeyPresent) degraded.push("gemini_key_missing");
  if (offline && input.seededFacts > 0) degraded.push("seeded_facts_in_use");

  let status: HealthStatus;
  if (input.database !== "ok") status = "error";
  else if (offline) status = "degraded"; // usable, but not the production setup
  else status = input.geminiKeyPresent ? "ok" : "error";

  const httpStatus = status === "error" ? 503 : 200;
  return {
    httpStatus,
    body: {
      app: "ok",
      status,
      backend: input.backend,
      offline,
      degraded,
      database: input.database,
      geminiKeyPresent: input.geminiKeyPresent,
      seededFacts: offline ? input.seededFacts : 0,
      demoMode: input.demoMode,
      engineVersion: input.engineVersion,
      promptVersion: input.promptVersion,
    },
  };
}

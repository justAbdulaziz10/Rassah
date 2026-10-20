import "server-only";
import { z } from "zod";

// Env vars are validated lazily per feature, so a missing Gemini key does not
// stop the engine or the dashboard from working (the health check reports it).

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const AppEnvSchema = z.object({
  DEMO_MODE: optionalString.transform((v) => v === "true"),
  ENGINE_VERSION: optionalString.transform((v) => v ?? "engine-0.1"),
  PROMPT_VERSION: optionalString.transform((v) => v ?? "v1"),
  ALERT_WEBHOOK_URL: optionalString,
});

const GeminiEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is missing"),
  GEMINI_MODEL: z.string().min(1, "GEMINI_MODEL is missing"),
  GEMINI_PRICE_INPUT_PER_M: z.coerce.number().nonnegative().default(0),
  GEMINI_PRICE_OUTPUT_PER_M: z.coerce.number().nonnegative().default(0),
});

const SupabaseEnvSchema = z.object({
  SUPABASE_URL: z.url("SUPABASE_URL must be a URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is missing"),
});

export type AppEnv = z.infer<typeof AppEnvSchema>;
export type GeminiEnv = z.infer<typeof GeminiEnvSchema>;
export type SupabaseEnv = z.infer<typeof SupabaseEnvSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

function parse<T>(schema: z.ZodType<T>, label: string): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.message).join("; ");
    throw new EnvError(`${label} configuration error: ${missing}`);
  }
  return result.data;
}

export function appEnv(): AppEnv {
  return parse(AppEnvSchema, "App");
}

export function geminiEnv(): GeminiEnv {
  return parse(GeminiEnvSchema, "Gemini");
}

export function supabaseEnv(): SupabaseEnv {
  return parse(SupabaseEnvSchema, "Supabase");
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

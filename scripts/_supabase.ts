// Supabase client for CLI scripts (seed, reset, evals). Reads .env.local via `tsx --env-file-if-exists`.
// Scripts don't import lib/db/supabase.ts because it is marked `server-only` for the Next.js app.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function scriptSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (copy .env.example to .env.local).");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function must<T>(op: string, res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    console.error(`${op} failed: ${res.error.message}`);
    process.exit(1);
  }
  return res.data;
}

export function confirmed(): boolean {
  return process.argv.includes("--yes");
}

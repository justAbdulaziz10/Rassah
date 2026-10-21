import "server-only";
import { getLocalRepo } from "@/lib/db/local";
import { getRepo } from "@/lib/db/supabase";
import type { Repo } from "@/lib/db/repo";
import { EnvError, hasSupabaseConfig, isLocalBackend } from "@/lib/env";

/** JSON error response. Never includes stack traces, prompts or secrets. */
export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

/** Returns the repo, or a 503 response when Supabase is not configured. */
export function repoOrError(): Repo | Response {
  if (isLocalBackend()) return getLocalRepo();
  if (!hasSupabaseConfig()) return jsonError(503, "Database is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  try {
    return getRepo();
  } catch (e) {
    return jsonError(503, e instanceof EnvError ? e.message : "Database unavailable");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

export function log(entry: Record<string, unknown>) {
  // One structured line per stage, searchable in Vercel logs by runId.
  console.log(JSON.stringify({ app: "rassah", ...entry }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run ids are Postgres uuids; anything else would make the database throw instead of returning "not found". */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}

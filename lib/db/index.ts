import "server-only";
// Data access: the Repo interface and its types. The Supabase implementation lives in
// ./supabase (server-only); import getRepo from "@/lib/db/supabase" in server code.
export type { Repo } from "./repo";
export * from "./types";

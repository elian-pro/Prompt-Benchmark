import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (service_role).
 *
 * Uses the service_role key, which bypasses RLS — NEVER import this from a
 * client component. All LLM/DB access goes through API routes in /app/api or
 * helpers in /lib (see docs/ARCHITECTURE.md, security model).
 *
 * Singleton: reused across requests within the same server process so we
 * don't open a new client per request.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias.",
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}

/**
 * Whether the conversation-history database is configured.
 *
 * The history used to live in a second Supabase project and had its own
 * service_role client here (getChatsSupabase). Since the August 2026 migration
 * it is a plain Postgres reached with the pg driver, so the client is gone and
 * only this check remains, kept at this path because seven modules import it.
 * The connection itself lives in lib/chats-db.ts.
 */
export function isChatsConfigured(): boolean {
  return Boolean(process.env.CHATS_DB_PASSWORD);
}

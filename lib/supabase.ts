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
 * Server-side client for the SECOND Supabase project ("chats"), where the
 * agents store their real client/lead conversation history (one table per
 * client, chats_<Cliente>). Same service_role rules as getSupabase: never
 * import from a client component; read-only usage lives in lib/db/chats-history.
 *
 * Separate singleton bound to its own project via CHATS_SUPABASE_URL /
 * CHATS_SUPABASE_SERVICE_ROLE_KEY.
 */
let chatsClient: SupabaseClient | null = null;

export function getChatsSupabase(): SupabaseClient {
  if (chatsClient) return chatsClient;

  const url = process.env.CHATS_SUPABASE_URL;
  const serviceRoleKey = process.env.CHATS_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan variables de entorno: CHATS_SUPABASE_URL y CHATS_SUPABASE_SERVICE_ROLE_KEY son obligatorias para el historial de conversaciones.",
    );
  }

  chatsClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return chatsClient;
}

/** Whether the "chats" DB connection is configured (both env vars present). */
export function isChatsConfigured(): boolean {
  return Boolean(process.env.CHATS_SUPABASE_URL && process.env.CHATS_SUPABASE_SERVICE_ROLE_KEY);
}

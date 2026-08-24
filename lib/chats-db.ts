/**
 * Connection to the conversation-history Postgres (the VPS), which replaced the
 * second Supabase project in the August 2026 migration.
 *
 * Shape of the destination: one SCHEMA per client, each with a single table
 * named `chats`: "Sofía".chats, "Bad Boys Toys".chats. That is the house
 * convention of that database (see the callpicker/ops/crm schemas beside it),
 * and it is what the n8n agent flows write to.
 *
 * Why a direct driver and not PostgREST: that database has no API layer, only
 * Postgres. A welcome side effect is that DDL no longer needs the account-wide
 * SUPABASE_ACCESS_TOKEN the old chats-admin required.
 *
 * Identifier validation and quoting live in ./chats-table-name, which is pure
 * so the browser can use it too; this module is server-side only, same rule as
 * lib/supabase.ts. Error messages are in Spanish because they surface in the UI.
 */
import { Pool, type QueryResultRow } from "pg";

/** Whether the history database is configured. */
export function isChatsDbConfigured(): boolean {
  return Boolean(process.env.CHATS_DB_PASSWORD);
}

let pool: Pool | null = null;

/**
 * Singleton pool, same reasoning as the Supabase singletons: Next.js reuses the
 * server process across requests, so a pool per request would burn through the
 * server's connection slots. `max` is deliberately small, because that database also
 * serves n8n and Metabase.
 *
 * Host and port come from env so the deploy can switch to EasyPanel's internal
 * network (faster, never leaves the private network) without a code change; the
 * default is the public address the migration scripts already use.
 */
export function getChatsPool(): Pool {
  if (pool) return pool;
  const password = process.env.CHATS_DB_PASSWORD;
  if (!password) {
    throw new Error(
      "Falta CHATS_DB_PASSWORD: la base de datos de conversaciones no está configurada.",
    );
  }
  pool = new Pool({
    host: process.env.CHATS_DB_HOST || "177.7.43.4",
    port: Number(process.env.CHATS_DB_PORT || 5432),
    user: process.env.CHATS_DB_USER || "admin",
    password,
    database: process.env.CHATS_DB_NAME || "postgres",
    // That server has no TLS configured; the connection string the rest of the
    // stack uses carries sslmode=disable for the same reason.
    ssl: false,
    max: Number(process.env.CHATS_DB_POOL_MAX || 4),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Without this listener a dropped idle connection surfaces as an unhandled
  // 'error' event, which takes the whole server process down.
  pool.on("error", (err) => {
    console.error("[chats-db] error en conexión inactiva:", err.message);
  });
  return pool;
}

/** Runs a parameterized query. Values ALWAYS go as $1/$2, never interpolated. */
export async function chatsQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await getChatsPool().query<T>(sql, params);
  return rows;
}

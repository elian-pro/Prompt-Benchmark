/**
 * The ONLY module that writes to the conversation-history Postgres, and the
 * only one that runs DDL anywhere. It creates a client's schema and its `chats`
 * table when the client is provisioned.
 *
 * Until August 2026 this had to go through the Supabase Management API, because
 * PostgREST cannot run DDL and that project had no RPC for it. That meant
 * carrying SUPABASE_ACCESS_TOKEN, a token scoped to the whole account, just to
 * create one table. Now that the history lives on a plain Postgres we connect
 * with the same credentials as every read, and the token is gone.
 *
 * The narrowness stays: the SQL comes from buildCreateChatsTableSql, a fixed
 * template, and the schema name is validated and double-quoted before it is
 * interpolated. Nothing user-authored ever reaches the database as SQL.
 *
 * Server-side only. Error messages are in Spanish because they surface in the
 * UI, same convention as lib/n8n/client.ts.
 */
// Extension-ful import so `node --test` can run this module, same as
// lib/prompts/editor-persona.ts does with ./options-block.ts.
import { buildCreateChatsTableSql } from "./chats-table-name.ts";
import { getChatsPool, isChatsDbConfigured } from "./chats-db.ts";

/** Custom error so API routes can tell an upstream failure from a bad request. */
export class ChatsAdminError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ChatsAdminError";
    this.status = status;
  }
}

/** True when the history database is configured for writing. */
export function isChatsAdminConfigured(): boolean {
  return isChatsDbConfigured();
}

/**
 * Creates the client's schema and its `chats` table. Idempotent: every
 * statement is `if not exists`, so a retry over an existing schema succeeds
 * without touching its rows.
 *
 * All statements run in one transaction, so a failure half way (a missing
 * grant role, say) does not leave a schema with no table in it.
 */
export async function createChatsTable(schemaName: string): Promise<void> {
  if (!isChatsAdminConfigured()) {
    throw new ChatsAdminError(
      "La creación de tablas de chats no está configurada (falta CHATS_DB_PASSWORD).",
    );
  }
  // Throws on anything that is not a valid identifier, before it reaches SQL.
  const sql = buildCreateChatsTableSql(schemaName);

  const client = await getChatsPool().connect().catch(() => {
    throw new ChatsAdminError("No se pudo conectar a la base de datos de conversaciones.");
  });
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    const detail = err instanceof Error ? `: ${err.message}` : "";
    throw new ChatsAdminError(`No se pudo crear la tabla${detail}.`);
  } finally {
    client.release();
  }
}

/**
 * The ONLY module that writes to the "chats" Supabase project, and the only
 * one that runs DDL anywhere. It creates the per-client conversation table
 * (chats_<Cliente>) when a client is provisioned.
 *
 * Why the Management API and not the service_role client: PostgREST cannot run
 * DDL, and the chats project has no RPC for it. The trade-off is the token,
 * which is account-wide, so this module is deliberately narrow:
 *   - the project ref comes from env, never from a request;
 *   - the SQL is built by buildCreateChatsTableSql from a fixed template;
 *   - the table name is validated against CHATS_TABLE_RE before interpolation.
 * Nothing user-authored ever reaches the endpoint. If that scope is ever judged
 * too broad, the drop-in replacement is a security definer function in the
 * chats project (like supabase/chats/001_list_chat_tables.sql) and only this
 * file changes.
 *
 * Server-side only. Error messages are in Spanish because they surface in the
 * UI, same convention as lib/n8n/client.ts.
 */
// Extension-ful import so `node --test` can run this module, same as
// lib/prompts/editor-persona.ts does with ./options-block.ts.
import { buildCreateChatsTableSql } from "./chats-table-name.ts";

const MANAGEMENT_API = "https://api.supabase.com/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Custom error so API routes can tell an upstream failure from a bad request. */
export class ChatsAdminError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ChatsAdminError";
    this.status = status;
  }
}

/** True when the token and the target project are both configured. */
export function isChatsAdminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN && process.env.CHATS_SUPABASE_PROJECT_REF);
}

/**
 * Creates chats_<X> in the chats project. Idempotent: the DDL is
 * `create table if not exists`, so a retry over an existing table succeeds
 * without touching its rows.
 */
export async function createChatsTable(tableName: string): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.CHATS_SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    throw new ChatsAdminError(
      "La creación de tablas de chats no está configurada (falta SUPABASE_ACCESS_TOKEN o CHATS_SUPABASE_PROJECT_REF).",
    );
  }
  // Throws on anything that is not a chats_* name, before it reaches the SQL.
  const query = buildCreateChatsTableSql(tableName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${MANAGEMENT_API}/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ChatsAdminError("Supabase no respondió a tiempo al crear la tabla.");
    }
    throw new ChatsAdminError("No se pudo contactar a Supabase para crear la tabla.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      if (body?.message) detail = `: ${body.message}`;
    } catch {
      // Non-JSON error body, the status alone has to do.
    }
    if (res.status === 401 || res.status === 403) {
      throw new ChatsAdminError("Supabase rechazó el token de acceso.", res.status);
    }
    throw new ChatsAdminError(`No se pudo crear la tabla (${res.status})${detail}.`, res.status);
  }
}

/**
 * Read-only access to the SECOND Supabase project ("chats"), where the agents
 * store real client/lead conversations. One table per client, chats_<Cliente>,
 * each row a conversation blob:
 *   id, created_at, numero_de_mensajes, id_de_kommo (Kommo CRM lead id),
 *   historial (the full conversation as plain text: "User: ...\nIA: ..."),
 *   turnos (the same conversation as one object per turn, see
 *   supabase/chats/002_add_turnos.sql). Only flows duplicated from the updated
 *   template write turnos, so it is null for every row written before
 *   2026-07-30 and for every client still on an older flow; those rows are
 *   reconstructed from historial by lib/conversation-turns.ts.
 *
 * Client names do not map to table names, so the mapping is stored explicitly
 * as clients.chats_table (see migration 018). This module never writes.
 */
import { getChatsSupabase, isChatsConfigured } from "../supabase";
// The validator lives in the pure chats-table-name module so the same rule
// guards the PostgREST path here and the CREATE TABLE that provisioning sends.
import { isValidChatsTable } from "../chats-table-name";
import { isDateOnly, nextDay, searchFilterFor } from "../history-filters";

export { isValidChatsTable };

export type ChatsTable = { table: string; rows: number };

export type ConversationRow = {
  id: number;
  created_at: string;
  // PostgREST returns numeric columns as strings to preserve precision.
  numero_de_mensajes: number | string | null;
  id_de_kommo: string | null;
  historial: string | null;
  /** jsonb, so it arrives already parsed. Null on rows written by a flow that
   *  does not fill it yet. Shape validated in lib/conversation-turns.ts. */
  turnos: unknown;
};

export type ConversationPage = {
  rows: ConversationRow[];
  total: number;
  hasMore: boolean;
};

/**
 * Lists the available chats_* tables (name + approximate row count) via the
 * list_chat_tables() RPC in the chats DB. Used by the "connect history" picker
 * and the new-client auto-match.
 */
export async function listChatsTables(): Promise<ChatsTable[]> {
  const sb = getChatsSupabase();
  const { data, error } = await sb.rpc("list_chat_tables");
  if (error) {
    throw new Error(`No se pudieron listar las tablas de historial: ${error.message}`);
  }
  return (data ?? [])
    .map((r: { table_name: string; row_estimate: number | string | null }) => ({
      table: r.table_name,
      rows: Number(r.row_estimate ?? 0),
    }))
    .filter((t: ChatsTable) => isValidChatsTable(t.table));
}

export type HistoryFilters = {
  /** One box, three meanings: a Kommo lead id, our own row id, or free text. */
  search?: string;
  /** Date-only (yyyy-mm-dd) or a full timestamp. `to` is inclusive of the day. */
  from?: string;
  to?: string;
  /** Conversations with at most this many messages: the cheapest "the lead
   *  left early" filter there is. */
  maxMessages?: number;
};

/**
 * Reads one page of a client's conversation history, newest first. Validates
 * the table name first (defense against a bad/stale chats_table value).
 *
 * There is no filter for the conversation's final estado yet. It is already
 * reachable through `search` because the flows write the state into
 * `historial` too ("se mueve a humano"), which is imprecise but works on every
 * row, old and new. The precise version is `turnos @> [{"estado": X}]`, worth
 * doing once all client flows write the column (today only three do).
 */
export async function getClientHistory(
  chatsTable: string,
  { limit, offset, ...filters }: { limit: number; offset: number } & HistoryFilters,
): Promise<ConversationPage> {
  if (!isValidChatsTable(chatsTable)) {
    throw new Error("Tabla de historial no válida.");
  }
  const sb = getChatsSupabase();
  let query = sb
    .from(chatsTable)
    .select("id, created_at, numero_de_mensajes, id_de_kommo, historial, turnos", {
      count: "exact",
    });

  const search = filters.search ? searchFilterFor(filters.search) : null;
  if (search) {
    query =
      search.kind === "or"
        ? query.or(search.filter)
        : query.ilike(search.column, search.pattern);
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) {
    query = isDateOnly(filters.to)
      ? query.lt("created_at", nextDay(filters.to))
      : query.lte("created_at", filters.to);
  }
  if (filters.maxMessages != null) {
    query = query.lte("numero_de_mensajes", filters.maxMessages);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    throw new Error(`No se pudo leer el historial: ${error.message}`);
  }
  const rows = (data ?? []) as ConversationRow[];
  const total = count ?? offset + rows.length;
  return { rows, total, hasMore: offset + rows.length < total };
}

/**
 * One conversation by its row id. Read fresh at the moment a case is filed, so
 * the snapshot stored with the case is what the agents had actually written by
 * then, not whatever the list happened to be showing.
 */
export async function getConversation(
  chatsTable: string,
  rowId: number,
): Promise<ConversationRow | null> {
  if (!isValidChatsTable(chatsTable)) {
    throw new Error("Tabla de historial no válida.");
  }
  const sb = getChatsSupabase();
  const { data, error } = await sb
    .from(chatsTable)
    .select("id, created_at, numero_de_mensajes, id_de_kommo, historial, turnos")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la conversación: ${error.message}`);
  return (data as ConversationRow | null) ?? null;
}

/** Strip accents/spaces/punctuation and lowercase, for name comparison. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the chats_* table whose name (minus the chats_ prefix) matches a
 * client name exactly once, after normalizing. Returns null on no match or an
 * ambiguous match, so auto-suggestion never guesses wrong. Existing clients
 * with partial/renamed tables (e.g. "Norma Montoya" -> chats_Norma) fall
 * through to null and are connected by hand.
 */
export function matchChatsTable(clientName: string, available: string[]): string | null {
  const target = normalize(clientName);
  if (!target) return null;
  const hits = available.filter((t) => normalize(t.replace(/^chats_/, "")) === target);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Best-effort auto-match for a newly created client. Never throws and never
 * blocks client creation: if the chats DB is not configured or unreachable, it
 * silently returns null and the client is left unconnected.
 */
export async function suggestChatsTable(clientName: string): Promise<string | null> {
  if (!isChatsConfigured()) return null;
  try {
    const tables = await listChatsTables();
    return matchChatsTable(clientName, tables.map((t) => t.table));
  } catch {
    return null;
  }
}

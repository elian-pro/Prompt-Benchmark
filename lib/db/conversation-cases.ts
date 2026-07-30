/**
 * Cases: real conversations someone marked as "the bot got this wrong".
 *
 * Lives in prompt_studio, not in the chats project, because that one is the
 * agents' production database and this app treats it as read only. See
 * supabase/migrations/020_conversation_cases.sql for why the snapshots are
 * frozen rather than read back from the source on demand.
 */
import { getSupabase } from "../supabase";

export type ConversationCase = {
  id: string;
  client_id: string;
  chats_table: string;
  row_id: number;
  id_de_kommo: string | null;
  conversation_at: string | null;
  historial_snapshot: string | null;
  turnos_snapshot: unknown;
  version_id: string | null;
  turno_index: number | null;
  nota: string;
  editor_session_id: string | null;
  /** The version that earned the "ya pasa" verdict, and when. Null means the
   *  case is still open: either never replayed, or replayed and still wrong. */
  resolved_version_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

const CASE_COLS =
  "id, client_id, chats_table, row_id, id_de_kommo, conversation_at, " +
  "historial_snapshot, turnos_snapshot, version_id, turno_index, nota, " +
  "editor_session_id, resolved_version_id, resolved_at, created_at";

export type NewCase = {
  clientId: string;
  chatsTable: string;
  rowId: number;
  idDeKommo?: string | null;
  conversationAt?: string | null;
  historialSnapshot?: string | null;
  turnosSnapshot?: unknown;
  versionId?: string | null;
  turnoIndex?: number | null;
  nota: string;
  editorSessionId?: string | null;
};

export async function createCase(input: NewCase): Promise<ConversationCase> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("conversation_cases")
    .insert({
      client_id: input.clientId,
      chats_table: input.chatsTable,
      row_id: input.rowId,
      id_de_kommo: input.idDeKommo ?? null,
      conversation_at: input.conversationAt ?? null,
      historial_snapshot: input.historialSnapshot ?? null,
      turnos_snapshot: input.turnosSnapshot ?? null,
      version_id: input.versionId ?? null,
      turno_index: input.turnoIndex ?? null,
      nota: input.nota,
      editor_session_id: input.editorSessionId ?? null,
    })
    .select(CASE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el caso: ${error.message}`);
  return data as unknown as ConversationCase;
}

export async function getCase(id: string): Promise<ConversationCase | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("conversation_cases")
    .select(CASE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el caso: ${error.message}`);
  return (data as unknown as ConversationCase | null) ?? null;
}

/**
 * Records the verdict after a replay. Passing is relative to a version, so the
 * one that earned it is stored with it; a later version that breaks the case
 * again clears both by passing null.
 */
export async function setCaseResolution(
  id: string,
  resolvedVersionId: string | null,
): Promise<ConversationCase> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("conversation_cases")
    .update({
      resolved_version_id: resolvedVersionId,
      resolved_at: resolvedVersionId ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select(CASE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el veredicto: ${error.message}`);
  return data as unknown as ConversationCase;
}

/** A case as the list shows it: no snapshots (heavy, and only the replay reads
 *  them) and with the client's name, since Replay lists every client's cases
 *  together. */
export type CaseListItem = Omit<
  ConversationCase,
  "historial_snapshot" | "turnos_snapshot"
> & { client_name: string };

/** CASE_COLS minus the snapshots, plus the client's name. Spelled out rather
 *  than derived: supabase-js parses this string at the type level and cannot
 *  read one built at runtime. */
const LIST_COLS =
  "id, client_id, chats_table, row_id, id_de_kommo, conversation_at, " +
  "version_id, turno_index, nota, editor_session_id, resolved_version_id, " +
  "resolved_at, created_at, clients(name)";

/**
 * Cases newest first, for one client or for all of them. Replay opens on the
 * whole list, because "what is still broken anywhere" is the question you
 * arrive with; narrowing to a client is the exception.
 */
export async function listCases(clientId?: string): Promise<CaseListItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("conversation_cases")
    .select(LIST_COLS)
    .order("created_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar los casos: ${error.message}`);
  // Cast because LIST_COLS is assembled from literals, which supabase-js
  // cannot parse at the type level; the shape is checked by CaseListItem.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((row) => {
    const { clients, ...rest } = row;
    return {
      ...rest,
      client_name: (clients as { name?: string } | null)?.name ?? "Cliente eliminado",
    };
  }) as CaseListItem[];
}

/**
 * Cases: real conversations someone marked as "the bot got this wrong".
 *
 * Lives in prompt_studio, not in the chats project, because that one is the
 * agents' production database and this app treats it as read only. See
 * supabase/migrations/020_conversation_cases.sql for why the snapshots are
 * frozen rather than read back from the source on demand.
 */
import { getSupabase } from "../supabase.ts";

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
  /** Where the replay cuts the history: see replayCutFor. Null only for a note
   *  that marks nothing. */
  turno_index: number | null;
  /** Every turn the note points at, for the pins in the transcript. */
  turnos_marcados: number[];
  nota: string;
  /** Null until the case is handed off: a saved note nobody sent yet. */
  editor_session_id: string | null;
  /** The version that earned the "ya pasa" verdict, and when. Null means the
   *  case is still open: either never replayed, or replayed and still wrong. */
  resolved_version_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

const CASE_COLS =
  "id, client_id, chats_table, row_id, id_de_kommo, conversation_at, " +
  "historial_snapshot, turnos_snapshot, version_id, turno_index, turnos_marcados, " +
  "nota, editor_session_id, resolved_version_id, resolved_at, created_at";

export type NewCase = {
  clientId: string;
  chatsTable: string;
  rowId: number;
  idDeKommo?: string | null;
  conversationAt?: string | null;
  historialSnapshot?: string | null;
  turnosSnapshot?: unknown;
  versionId?: string | null;
  turnosMarcados?: number[];
  /** Derived with replayCutFor, never sent by a client. */
  turnoIndex?: number | null;
  nota: string;
  editorSessionId?: string | null;
};

/**
 * The turn a replay cuts at, out of everything the note marked: the earliest
 * bot turn among them. A note can point at several messages, but a replay can
 * only answer one, and the earliest bot turn is where the conversation first
 * went wrong.
 *
 * Marking only lead messages is the other way people write a case: "after this
 * message the bot got it wrong", pointing at what the bot should have answered
 * rather than at its answer. So the earliest marked turn is the cut, and
 * buildReplayPlan already knows to start the reply right after a lead turn.
 *
 * Null only when the note marks nothing at all, which is a general note and
 * leaves the case unreplayable.
 */
export function replayCutFor(
  marked: number[],
  turns: { rol: string }[],
): number | null {
  const inOrder = [...marked].sort((a, b) => a - b);
  const bot = inOrder.find((i) => turns[i]?.rol === "bot");
  return bot ?? inOrder[0] ?? null;
}

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
      turnos_marcados: input.turnosMarcados ?? [],
      turno_index: input.turnoIndex ?? null,
      nota: input.nota,
      editor_session_id: input.editorSessionId ?? null,
    })
    .select(CASE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el caso: ${error.message}`);
  return data as unknown as ConversationCase;
}

/** Edits a saved note: its text and the messages it marks. */
export async function updateCaseNote(
  id: string,
  patch: { nota: string; turnosMarcados: number[]; turnoIndex: number | null },
): Promise<ConversationCase> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("conversation_cases")
    .update({
      nota: patch.nota,
      turnos_marcados: patch.turnosMarcados,
      turno_index: patch.turnoIndex,
    })
    .eq("id", id)
    .select(CASE_COLS)
    .single();
  if (error) throw new Error(`No se pudo editar la nota: ${error.message}`);
  return data as unknown as ConversationCase;
}

export async function deleteCase(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("conversation_cases").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el caso: ${error.message}`);
}

/** The saved notes for one conversation, oldest first so their numbering
 *  matches the order they were written in. */
export async function listCasesForConversation(
  clientId: string,
  chatsTable: string,
  rowId: number,
): Promise<ConversationCase[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("conversation_cases")
    .select(CASE_COLS)
    .eq("client_id", clientId)
    .eq("chats_table", chatsTable)
    .eq("row_id", rowId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron listar las notas: ${error.message}`);
  return (data ?? []) as unknown as ConversationCase[];
}

/** Links every case handed off in one go to the Editor session it produced. */
export async function attachEditorSession(
  ids: string[],
  editorSessionId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const sb = getSupabase();
  const { error } = await sb
    .from("conversation_cases")
    .update({ editor_session_id: editorSessionId })
    .in("id", ids);
  if (error) throw new Error(`No se pudo enlazar la sesión: ${error.message}`);
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
  "version_id, turno_index, turnos_marcados, nota, editor_session_id, " +
  "resolved_version_id, resolved_at, created_at, clients(name)";

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

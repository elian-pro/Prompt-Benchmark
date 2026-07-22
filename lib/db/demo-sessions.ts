/**
 * Data access for Playground sessions (Sprint 6, T2): a manual conversation
 * where the user themselves plays the lead against a client's prompt, frozen
 * at the version tested (same snapshot idea as an Adversarial run's bot
 * side). Always uses the `test_bot` role so the conversation reflects
 * production behavior. No persona, no turn limit, no judge.
 */
import { getSupabase } from "../supabase";
import { getVersion } from "./versions";
import { getRoleDefault } from "./role-defaults";
import { RoleNotConfiguredError } from "./runs";
import { listNotes, type DemoNoteRow } from "./demo-notes";

export type DemoSessionStatus = "active" | "sent_to_editor";
export type DemoMessageRole = "human" | "bot";

export type DemoSession = {
  id: string;
  client_id: string;
  version_id: string | null;
  version_number_snapshot: string;
  prompt_snapshot: string;
  status: DemoSessionStatus;
  editor_session_id: string | null;
  current_round: number;
  /** Optional canned bot message replayed as turn 1 whenever a fresh round
   *  starts (creation, reset, version switch), so the chat can open with the
   *  bot having already "spoken" instead of always waiting on the human. */
  opening_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DemoMessageRow = {
  id: string;
  session_id: string;
  turn_number: number;
  round: number;
  role: DemoMessageRole;
  content: string;
  version_number_snapshot: string | null;
  created_at: string;
};

export type DemoSessionListItem = DemoSession & {
  client_name: string | null;
  message_count: number;
};
export type DemoSessionDetail = DemoSessionListItem & {
  messages: DemoMessageRow[];
  notes: DemoNoteRow[];
  /** Messages referenced by a note that live in an older round (so they are
   *  not in `messages`). Lets the UI resolve a note's bubble preview without
   *  showing those messages in the chat. */
  note_messages: DemoMessageRow[];
};

const SESSION_COLS =
  "id, client_id, version_id, version_number_snapshot, prompt_snapshot, status, " +
  "editor_session_id, current_round, opening_message, created_at, updated_at";
const MESSAGE_COLS =
  "id, session_id, turn_number, round, role, content, version_number_snapshot, created_at";

function flattenListItem(row: any): DemoSessionListItem {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const messages: any[] = Array.isArray(row.demo_messages) ? row.demo_messages : [];
  const { clients: _c, demo_messages: _m, ...session } = row;
  const currentRound = (session as DemoSession).current_round ?? 1;
  // Only the active round counts toward the list preview.
  const count = messages.filter((m) => (m.round ?? 1) === currentRound).length;
  return {
    ...(session as DemoSession),
    client_name: client?.name ?? null,
    message_count: count,
  };
}

/** Replays `openingMessage`, if set, as the fresh round's turn 1 bot message.
 *  Shared by createSession, resetSession and updateSessionVersion, the three
 *  places that start a "clean" round, so a configured greeting shows up
 *  consistently every time the chat starts from zero, not just on creation. */
async function seedOpeningMessage(
  sessionId: string,
  round: number,
  openingMessage: string | null,
  versionNumberSnapshot: string,
): Promise<void> {
  if (!openingMessage) return;
  await appendMessage(sessionId, {
    turnNumber: 1,
    round,
    role: "bot",
    content: openingMessage,
    versionNumberSnapshot,
  });
}

export async function createSession(input: {
  clientId: string;
  versionId: string;
  /** Optional canned bot message shown as soon as the chat opens (Sprint 14). */
  openingMessage?: string;
}): Promise<DemoSession> {
  const version = await getVersion(input.versionId);
  if (!version) throw new Error("La versión a probar no existe.");
  if (version.client_id !== input.clientId) {
    throw new Error("La versión no pertenece al cliente indicado.");
  }
  // Fail before creating the session row if the bot side has no model set.
  const role = await getRoleDefault("test_bot");
  if (!role) {
    throw new RoleNotConfiguredError(
      "No hay un modelo asignado al rol Bot de prueba. Configúralo en Configuración.",
    );
  }

  const openingMessage = input.openingMessage?.trim() || null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_sessions")
    .insert({
      client_id: input.clientId,
      version_id: input.versionId,
      version_number_snapshot: version.version_number,
      prompt_snapshot: version.content,
      status: "active",
      opening_message: openingMessage,
    })
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo crear la conversación: ${error.message}`);
  const session = data as unknown as DemoSession;

  await seedOpeningMessage(session.id, session.current_round, openingMessage, version.version_number);
  return session;
}

export async function listSessions({
  clientId,
}: { clientId?: string } = {}): Promise<DemoSessionListItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("demo_sessions")
    .select(`${SESSION_COLS}, clients(name), demo_messages(id, round)`);
  if (clientId) query = query.eq("client_id", clientId);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar las conversaciones: ${error.message}`);
  return (data ?? []).map(flattenListItem);
}

export async function getSession(id: string): Promise<DemoSessionDetail | null> {
  const sb = getSupabase();
  const { data: session, error } = await sb
    .from("demo_sessions")
    .select(`${SESSION_COLS}, clients(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener la conversación: ${error.message}`);
  if (!session) return null;

  // Only the active round is shown in the chat; older rounds remain in the
  // table so note previews keep resolving (see rounds model in the plan).
  const currentRound = (session as any).current_round ?? 1;
  const { data: messages, error: mErr } = await sb
    .from("demo_messages")
    .select(MESSAGE_COLS)
    .eq("session_id", id)
    .eq("round", currentRound)
    .order("turn_number", { ascending: true });
  if (mErr) throw new Error(`No se pudieron obtener los mensajes: ${mErr.message}`);

  const notes = await listNotes(id);

  // Resolve any note-referenced messages that live in an older round, so the
  // note previews keep working after a reset/version switch.
  const currentRoundIds = new Set((messages ?? []).map((m: any) => m.id));
  const referencedIds = [
    ...new Set(notes.flatMap((n) => n.message_ids).filter((mid) => !currentRoundIds.has(mid))),
  ];
  let noteMessages: DemoMessageRow[] = [];
  if (referencedIds.length > 0) {
    const { data: refRows, error: rErr } = await sb
      .from("demo_messages")
      .select(MESSAGE_COLS)
      .eq("session_id", id)
      .in("id", referencedIds);
    if (rErr) throw new Error(`No se pudieron obtener los mensajes referenciados: ${rErr.message}`);
    noteMessages = (refRows ?? []) as unknown as DemoMessageRow[];
  }

  return {
    ...flattenListItem({ ...session, demo_messages: messages ?? [] }),
    messages: (messages ?? []) as unknown as DemoMessageRow[],
    notes,
    note_messages: noteMessages,
  };
}

export async function appendMessage(
  sessionId: string,
  input: {
    turnNumber: number;
    role: DemoMessageRole;
    content: string;
    round: number;
    versionNumberSnapshot?: string | null;
  },
): Promise<DemoMessageRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_messages")
    .insert({
      session_id: sessionId,
      turn_number: input.turnNumber,
      round: input.round,
      role: input.role,
      content: input.content,
      version_number_snapshot: input.versionNumberSnapshot ?? null,
    })
    .select(MESSAGE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);
  return data as unknown as DemoMessageRow;
}

/** Custom error so the API can return 409 when a version switch is blocked. */
export class VersionSwitchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionSwitchBlockedError";
  }
}

/**
 * Switches the session's active version and starts a fresh round (clean
 * comparison: the bot won't carry another version's replies). Only allowed
 * while the session has no notes, since notes are tied to the version they
 * were created against (Sprint 8, T6).
 */
export async function updateSessionVersion(
  sessionId: string,
  versionId: string,
): Promise<DemoSession> {
  const sb = getSupabase();

  const { data: sessionRow, error: sErr } = await sb
    .from("demo_sessions")
    .select("client_id, current_round")
    .eq("id", sessionId)
    .single();
  if (sErr) throw new Error(`No se pudo obtener la conversación: ${sErr.message}`);

  const { count, error: nErr } = await sb
    .from("demo_notes")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (nErr) throw new Error(`No se pudieron verificar las notas: ${nErr.message}`);
  if ((count ?? 0) > 0) {
    throw new VersionSwitchBlockedError(
      "Para cambiar de versión, elimina las notas primero. Las notas están ligadas a la versión con la que las creaste.",
    );
  }

  const version = await getVersion(versionId);
  if (!version) throw new Error("La versión a probar no existe.");
  if (version.client_id !== sessionRow.client_id) {
    throw new Error("La versión no pertenece al cliente de esta conversación.");
  }

  const { data, error } = await sb
    .from("demo_sessions")
    .update({
      version_id: version.id,
      version_number_snapshot: version.version_number,
      prompt_snapshot: version.content,
      current_round: (sessionRow.current_round ?? 1) + 1,
    })
    .eq("id", sessionId)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo cambiar la versión: ${error.message}`);
  const session = data as unknown as DemoSession;

  await seedOpeningMessage(
    session.id,
    session.current_round,
    session.opening_message,
    session.version_number_snapshot,
  );
  return session;
}

/**
 * Starts a fresh conversation round: bumps `current_round`. Old messages stay
 * in the table (so note previews keep resolving) but drop out of the chat view.
 * Notes are session-scoped, so they persist across the reset (Sprint 8, T5).
 */
export async function resetSession(sessionId: string): Promise<DemoSession> {
  const sb = getSupabase();
  const { data: current, error: gErr } = await sb
    .from("demo_sessions")
    .select("current_round")
    .eq("id", sessionId)
    .single();
  if (gErr) throw new Error(`No se pudo obtener la conversación: ${gErr.message}`);

  const { data, error } = await sb
    .from("demo_sessions")
    .update({ current_round: (current.current_round ?? 1) + 1 })
    .eq("id", sessionId)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo reiniciar la conversación: ${error.message}`);
  const session = data as unknown as DemoSession;

  await seedOpeningMessage(
    session.id,
    session.current_round,
    session.opening_message,
    session.version_number_snapshot,
  );
  return session;
}

/**
 * Edits the opening message after the chat has started (Sprint 15). Updates
 * both the stored `opening_message` (so future rounds replay the new text on
 * reset / version switch) and the visible turn-1 bot bubble of the current
 * round, keeping the two in sync.
 */
export async function updateOpeningMessage(
  sessionId: string,
  text: string,
): Promise<DemoSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_sessions")
    .update({ opening_message: text })
    .eq("id", sessionId)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo actualizar el mensaje de inicio: ${error.message}`);
  const session = data as unknown as DemoSession;

  const { error: mErr } = await sb
    .from("demo_messages")
    .update({ content: text })
    .eq("session_id", sessionId)
    .eq("round", session.current_round)
    .eq("turn_number", 1)
    .eq("role", "bot");
  if (mErr) throw new Error(`No se pudo actualizar el mensaje visible: ${mErr.message}`);

  return session;
}

/** Marks a Playground session as handed off, linking the Editor session it
 *  spawned (Sprint 6, T4 — "Enviar al Editor"). */
export async function markSentToEditor(
  sessionId: string,
  editorSessionId: string,
): Promise<DemoSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_sessions")
    .update({ status: "sent_to_editor", editor_session_id: editorSessionId })
    .eq("id", sessionId)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo marcar la conversación como enviada: ${error.message}`);
  return data as unknown as DemoSession;
}

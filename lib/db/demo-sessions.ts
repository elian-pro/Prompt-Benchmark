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
  created_at: string;
  updated_at: string;
};

export type DemoMessageRow = {
  id: string;
  session_id: string;
  turn_number: number;
  role: DemoMessageRole;
  content: string;
  created_at: string;
};

export type DemoSessionListItem = DemoSession & {
  client_name: string | null;
  message_count: number;
};
export type DemoSessionDetail = DemoSessionListItem & {
  messages: DemoMessageRow[];
  notes: DemoNoteRow[];
};

const SESSION_COLS =
  "id, client_id, version_id, version_number_snapshot, prompt_snapshot, status, " +
  "editor_session_id, created_at, updated_at";
const MESSAGE_COLS = "id, session_id, turn_number, role, content, created_at";

function flattenListItem(row: any): DemoSessionListItem {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const messages = row.demo_messages;
  const { clients: _c, demo_messages: _m, ...session } = row;
  return {
    ...(session as DemoSession),
    client_name: client?.name ?? null,
    message_count: Array.isArray(messages) ? messages.length : 0,
  };
}

export async function createSession(input: {
  clientId: string;
  versionId: string;
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

  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_sessions")
    .insert({
      client_id: input.clientId,
      version_id: input.versionId,
      version_number_snapshot: version.version_number,
      prompt_snapshot: version.content,
      status: "active",
    })
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo crear la conversación: ${error.message}`);
  return data as unknown as DemoSession;
}

export async function listSessions({
  clientId,
}: { clientId?: string } = {}): Promise<DemoSessionListItem[]> {
  const sb = getSupabase();
  let query = sb.from("demo_sessions").select(`${SESSION_COLS}, clients(name), demo_messages(id)`);
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

  const { data: messages, error: mErr } = await sb
    .from("demo_messages")
    .select(MESSAGE_COLS)
    .eq("session_id", id)
    .order("turn_number", { ascending: true });
  if (mErr) throw new Error(`No se pudieron obtener los mensajes: ${mErr.message}`);

  const notes = await listNotes(id);

  return {
    ...flattenListItem({ ...session, demo_messages: messages ?? [] }),
    messages: (messages ?? []) as unknown as DemoMessageRow[],
    notes,
  };
}

export async function appendMessage(
  sessionId: string,
  input: { turnNumber: number; role: DemoMessageRole; content: string },
): Promise<DemoMessageRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_messages")
    .insert({
      session_id: sessionId,
      turn_number: input.turnNumber,
      role: input.role,
      content: input.content,
    })
    .select(MESSAGE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);
  return data as unknown as DemoMessageRow;
}

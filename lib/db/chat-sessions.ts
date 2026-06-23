/**
 * Data access for chat sessions (Editor and Creator chats).
 *
 * Sprint 2 only uses type 'editor'; 'creator' lands in Sprint 3. A session
 * carries a working draft (`current_draft_content`) seeded from the base
 * version and updated as the conversation produces new prompt revisions.
 *
 * `updated_at` is maintained by the `trg_chat_sessions_updated_at` trigger on
 * every UPDATE. Appending a message writes to `chat_messages`, not the session,
 * so `appendMessage` also touches the session to keep the list ordered by
 * recent activity.
 */
import { getSupabase } from "../supabase";
import { getVersion } from "./versions";

export type SessionType = "editor" | "creator";
export type SessionStatus = "active" | "finalized" | "abandoned";
export type MessageRole = "user" | "assistant";

/** Reference to an uploaded file attached to a message (populated in S2-T7). */
export type Attachment = {
  uploadId: string;
  filename: string;
  mimeType: string | null;
};

export type ChatMessageRow = {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  attachments: Attachment[] | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
};

export type ChatSession = {
  id: string;
  client_id: string | null;
  type: SessionType;
  title: string | null;
  status: SessionStatus;
  base_version_id: string | null;
  current_draft_content: string | null;
  final_version_id: string | null;
  model_provider_id: string | null;
  model_name: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
};

/** List item enriched with the client's name (resolved via join). */
export type ChatSessionListItem = ChatSession & { client_name: string | null };

/** A session plus its ordered messages. */
export type ChatSessionDetail = ChatSession & { messages: ChatMessageRow[] };

const SESSION_COLS =
  "id, client_id, type, title, status, base_version_id, current_draft_content, " +
  "final_version_id, model_provider_id, model_name, created_at, updated_at, finalized_at";

const MESSAGE_COLS =
  "id, session_id, role, content, attachments, tokens_in, tokens_out, created_at";

function flattenListItem(row: any): ChatSessionListItem {
  // Supabase returns the joined client as an object or array depending on the
  // relationship inference; handle both shapes defensively (see role-defaults).
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const { clients: _omit, ...session } = row;
  return { ...(session as unknown as ChatSession), client_name: client?.name ?? null };
}

export async function listSessions({
  type,
  clientId,
}: {
  type: SessionType;
  clientId?: string;
}): Promise<ChatSessionListItem[]> {
  const sb = getSupabase();
  let query = sb
    .from("chat_sessions")
    .select(`${SESSION_COLS}, clients(name)`)
    .eq("type", type);
  if (clientId) query = query.eq("client_id", clientId);
  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar las sesiones: ${error.message}`);
  return (data ?? []).map(flattenListItem);
}

export async function getSession(id: string): Promise<ChatSessionDetail | null> {
  const sb = getSupabase();
  const { data: session, error } = await sb
    .from("chat_sessions")
    .select(SESSION_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener la sesión: ${error.message}`);
  if (!session) return null;

  const { data: messages, error: mErr } = await sb
    .from("chat_messages")
    .select(MESSAGE_COLS)
    .eq("session_id", id)
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(`No se pudieron obtener los mensajes: ${mErr.message}`);

  return {
    ...(session as unknown as ChatSession),
    messages: (messages ?? []) as unknown as ChatMessageRow[],
  };
}

export async function createSession(input: {
  clientId: string;
  baseVersionId: string;
  title?: string | null;
}): Promise<ChatSession> {
  const sb = getSupabase();

  // Seed the working draft from the base version's content so the first edit
  // starts from the real prompt rather than an empty buffer.
  const baseVersion = await getVersion(input.baseVersionId);
  if (!baseVersion) throw new Error("La versión base no existe.");

  const { data, error } = await sb
    .from("chat_sessions")
    .insert({
      client_id: input.clientId,
      type: "editor",
      title: input.title ?? null,
      status: "active",
      base_version_id: input.baseVersionId,
      current_draft_content: baseVersion.content,
    })
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo crear la sesión: ${error.message}`);
  return data as unknown as ChatSession;
}

export async function appendMessage(
  sessionId: string,
  input: {
    role: MessageRole;
    content: string;
    attachments?: Attachment[] | null;
    tokensIn?: number | null;
    tokensOut?: number | null;
  },
): Promise<ChatMessageRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      role: input.role,
      content: input.content,
      attachments: input.attachments ?? null,
      tokens_in: input.tokensIn ?? null,
      tokens_out: input.tokensOut ?? null,
    })
    .select(MESSAGE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);

  // Surface the session as recently active (messages don't touch the parent).
  await touch(sessionId);
  return data as unknown as ChatMessageRow;
}

export async function updateDraft(
  sessionId: string,
  content: string,
): Promise<ChatSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("chat_sessions")
    .update({ current_draft_content: content })
    .eq("id", sessionId)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo actualizar el borrador: ${error.message}`);
  return data as unknown as ChatSession;
}

/** Bump `updated_at` so the session rises in the list (trigger sets now()). */
export async function touch(sessionId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`No se pudo actualizar la sesión: ${error.message}`);
}

/** Soft-close a session the user discarded without finalizing. */
export async function abandonSession(sessionId: string): Promise<ChatSession> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("chat_sessions")
    .update({ status: "abandoned" })
    .eq("id", sessionId)
    .select(SESSION_COLS)
    .single();
  if (error) throw new Error(`No se pudo descartar la sesión: ${error.message}`);
  return data as unknown as ChatSession;
}

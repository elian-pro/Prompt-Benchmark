/**
 * Data access for Playground notes (Sprint 6, T3): feedback the user writes
 * while conversing in a Playground session, optionally tagging one or more
 * messages from that same conversation. A note with no tagged messages is a
 * general note. These are what "Enviar al Editor" (T4) turns into the first
 * message of an Editor session.
 */
import { getSupabase } from "../supabase";
import type { DemoMessageRow } from "./demo-sessions";

export type DemoNoteSource = "admin" | "client";
export type DemoNoteStatus = "pending" | "approved" | "rejected";

export type DemoNoteRow = {
  id: string;
  session_id: string;
  /** What is wrong. Required in the Playground, which has this one field, and
   *  optional on a client's report, where the tagged message usually says it
   *  already (migration 024). */
  text: string | null;
  /** What the bot should have answered instead. This is the field that gets a
   *  prompt edited, so on a client's report it is the required one. */
  expected: string | null;
  message_ids: string[];
  /** Who wrote it. A note from a client is a proposal, not an instruction. */
  source: DemoNoteSource;
  /** Client notes land as `pending` and only reach the Editor once approved.
   *  Notes the user writes in the Playground default to `approved`, which is
   *  how every note behaved before demo links existed. */
  status: DemoNoteStatus;
  /** When this note was handed to the Editor. Null means it is still waiting,
   *  which is what makes it sendable (migration 028). Set by whichever route
   *  sent it, so the same instruction cannot travel twice. */
  sent_to_editor_at: string | null;
  /** The Editor conversation it went into, for tracing back. */
  editor_session_id: string | null;
  created_at: string;
  updated_at: string;
};

/** A client's report as the inbox reads it: the note, where it came from, and
 *  the turns it tagged, so a verdict can be given without opening the
 *  conversation it belongs to. */
export type DemoNoteWithContext = DemoNoteRow & {
  link_id: string | null;
  link_label: string | null;
  version_id: string | null;
  version_number: string | null;
  /** The whole conversation the note was written in, every round of it, so a
   *  reader can resolve the tagged turns AND the messages around them with
   *  `quotedWithContext`. Not the quotes themselves. */
  messages: DemoMessageRow[];
};

const NOTE_COLS =
  "id, session_id, text, expected, message_ids, source, status, " +
  "sent_to_editor_at, editor_session_id, created_at, updated_at";

export async function listNotes(sessionId: string): Promise<DemoNoteRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_notes")
    .select(NOTE_COLS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron listar las notas: ${error.message}`);
  return (data ?? []) as unknown as DemoNoteRow[];
}

/**
 * Every report a client wrote for this client's prompt, newest first, across
 * all of their links and conversations.
 *
 * Only `source='client'`. The notes the user writes to themselves in the
 * Playground already leave through that conversation's own handoff, and mixing
 * them in would turn an inbox of proposals into a list of things half of which
 * are already decisions.
 *
 * Two round trips, not one per note: the reports, then every tagged turn in a
 * single `in` query. The turns are quoted here rather than fetched by the page
 * because a verdict without the message it is about is a guess.
 */
export async function listClientNotes(clientId: string): Promise<DemoNoteWithContext[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_notes")
    .select(
      `${NOTE_COLS}, demo_sessions!inner(client_id, link_id, version_id, ` +
        "version_number_snapshot, demo_links(label))",
    )
    .eq("source", "client")
    .eq("demo_sessions.client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron listar los reportes: ${error.message}`);

  const rows = (data ?? []) as any[];
  // The whole conversation, not only the tagged ids. A report's tagged message
  // is half of what the reader needs: `quotedWithContext` derives the other
  // half from its neighbours, and it cannot do that from a list that was
  // already filtered down to the quotes. These are test conversations, tens of
  // messages each.
  const sessionIds = [...new Set(rows.map((r) => r.session_id as string))];
  const bySession = new Map<string, DemoMessageRow[]>();
  if (sessionIds.length > 0) {
    const { data: messages, error: mErr } = await sb
      .from("demo_messages")
      .select(
        "id, session_id, turn_number, round, role, content, tool_calls, " +
          "version_number_snapshot, created_at",
      )
      .in("session_id", sessionIds);
    if (mErr) throw new Error(`No se pudieron obtener los mensajes citados: ${mErr.message}`);
    for (const m of (messages ?? []) as unknown as DemoMessageRow[]) {
      bySession.set(m.session_id, [...(bySession.get(m.session_id) ?? []), m]);
    }
  }

  return rows.map((row) => {
    const session = Array.isArray(row.demo_sessions) ? row.demo_sessions[0] : row.demo_sessions;
    const link = Array.isArray(session?.demo_links) ? session.demo_links[0] : session?.demo_links;
    const { demo_sessions: _omit, ...note } = row;
    return {
      ...(note as DemoNoteRow),
      link_id: session?.link_id ?? null,
      link_label: link?.label ?? null,
      // The version this conversation ran, which is what the report is about:
      // a link can be pointed at another version mid round of testing.
      version_id: session?.version_id ?? null,
      version_number: session?.version_number_snapshot ?? null,
      messages: bySession.get(row.session_id) ?? [],
    };
  });
}

/** Stamps the reports that just left for the Editor. Called by every handoff
 *  route, right after the Editor session exists, so `approvedNotes` stops
 *  offering them. */
export async function markNotesSent(noteIds: string[], editorSessionId: string): Promise<void> {
  if (noteIds.length === 0) return;
  const sb = getSupabase();
  const { error } = await sb
    .from("demo_notes")
    .update({ sent_to_editor_at: new Date().toISOString(), editor_session_id: editorSessionId })
    .in("id", noteIds);
  if (error) throw new Error(`No se pudo marcar los reportes como enviados: ${error.message}`);
}

/** Confirms every id in `messageIds` belongs to this session, so a note can
 *  never reference another conversation's messages. */
async function assertMessagesBelongToSession(
  sessionId: string,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_messages")
    .select("id")
    .eq("session_id", sessionId)
    .in("id", messageIds);
  if (error) throw new Error(`No se pudieron validar los mensajes referenciados: ${error.message}`);
  if ((data ?? []).length !== messageIds.length) {
    throw new Error("Uno o más mensajes referenciados no pertenecen a esta conversación.");
  }
}

export async function createNote(
  sessionId: string,
  input: {
    text?: string | null;
    messageIds: string[];
    expected?: string | null;
    source?: DemoNoteSource;
    status?: DemoNoteStatus;
  },
): Promise<DemoNoteRow> {
  await assertMessagesBelongToSession(sessionId, input.messageIds);
  const sb = getSupabase();
  const { data, error } = await sb
    .from("demo_notes")
    .insert({
      session_id: sessionId,
      text: input.text ?? null,
      expected: input.expected ?? null,
      message_ids: input.messageIds,
      // The column defaults cover the Playground, which never passes these.
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
    })
    .select(NOTE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar la nota: ${error.message}`);
  return data as unknown as DemoNoteRow;
}

export async function updateNote(
  id: string,
  sessionId: string,
  input: {
    text?: string | null;
    expected?: string | null;
    messageIds?: string[];
    status?: DemoNoteStatus;
  },
): Promise<DemoNoteRow> {
  if (input.messageIds) await assertMessagesBelongToSession(sessionId, input.messageIds);
  const sb = getSupabase();
  const patch: Record<string, unknown> = {};
  if (input.text !== undefined) patch.text = input.text;
  if (input.expected !== undefined) patch.expected = input.expected;
  if (input.messageIds !== undefined) patch.message_ids = input.messageIds;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await sb
    .from("demo_notes")
    .update(patch)
    .eq("id", id)
    .eq("session_id", sessionId)
    .select(NOTE_COLS)
    .single();
  if (error) throw new Error(`No se pudo actualizar la nota: ${error.message}`);
  return data as unknown as DemoNoteRow;
}

export async function deleteNote(id: string, sessionId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("demo_notes").delete().eq("id", id).eq("session_id", sessionId);
  if (error) throw new Error(`No se pudo eliminar la nota: ${error.message}`);
}

/**
 * Data access for Playground notes (Sprint 6, T3): feedback the user writes
 * while conversing in a Playground session, optionally tagging one or more
 * messages from that same conversation. A note with no tagged messages is a
 * general note. These are what "Enviar al Editor" (T4) turns into the first
 * message of an Editor session.
 */
import { getSupabase } from "../supabase";

export type DemoNoteSource = "admin" | "client";
export type DemoNoteStatus = "pending" | "approved" | "rejected";

export type DemoNoteRow = {
  id: string;
  session_id: string;
  /** What is wrong. Written by whoever left the note. */
  text: string;
  /** What the bot should have answered instead. Optional, and the field that
   *  saves the most guesswork when the prompt is edited afterwards (Sprint 18). */
  expected: string | null;
  message_ids: string[];
  /** Who wrote it. A note from a client is a proposal, not an instruction. */
  source: DemoNoteSource;
  /** Client notes land as `pending` and only reach the Editor once approved.
   *  Notes the user writes in the Playground default to `approved`, which is
   *  how every note behaved before demo links existed. */
  status: DemoNoteStatus;
  created_at: string;
  updated_at: string;
};

const NOTE_COLS =
  "id, session_id, text, expected, message_ids, source, status, created_at, updated_at";

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
    text: string;
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
      text: input.text,
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
    text?: string;
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

import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/db/demo-sessions";
import { updateNote } from "@/lib/db/demo-notes";
import { reviewDemoNoteSchema } from "@/lib/schemas/demo-links";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; sessionId: string; noteId: string }> };

/**
 * The user's verdict on a client's report: approve it, discard it, or rewrite
 * it and then approve.
 *
 * Rewriting is not tampering with what the client said, it is translating it. A
 * client writes "no me entendió lo del horario"; the Editor needs "cuando
 * pregunten por horarios de fin de semana, responde X". What the client
 * originally typed stays in the conversation either way, which is the part that
 * has to survive a dispute.
 *
 * Only approved notes reach the Editor, and that gate lives in
 * `approvedNotes` (lib/prompts/playground-handoff.ts), not here.
 *
 * The full path is the authorization: the note is resolved through its session
 * and the session through its link, so a note id on its own reaches nothing.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, sessionId, noteId } = await params;

    const session = await getSession(sessionId);
    if (!session || session.link_id !== id) {
      return jsonError("Conversación no encontrada.", 404);
    }
    if (!session.notes.some((n) => n.id === noteId)) {
      return jsonError("Nota no encontrada.", 404);
    }

    const input = reviewDemoNoteSchema.parse(await req.json());
    const note = await updateNote(noteId, sessionId, {
      text: input.text,
      expected: input.expected,
      status: input.status,
    });
    return NextResponse.json(note);
  } catch (err) {
    return handleError(err);
  }
}

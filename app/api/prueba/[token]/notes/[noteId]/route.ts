import { NextRequest, NextResponse } from "next/server";

import { getVisitorSession } from "@/lib/db/demo-sessions";
import { listNotes, updateNote, deleteNote } from "@/lib/db/demo-notes";
import { updateClientNoteSchema } from "@/lib/schemas/demo-links";
import { DemoLinkError, openDemoContext } from "@/lib/demo-link-guard";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; noteId: string }> };

/**
 * The client can fix a typo or drop a note they just left, but only while it is
 * still `pending`. Once the user has approved or rejected it, it is part of the
 * record of the round and stops being editable: otherwise a note could be
 * rewritten after it was acted on, which defeats the point of keeping it.
 *
 * Both handlers resolve the note through the visitor's own session, so knowing
 * another note's id gets you nothing.
 */
async function ownPendingNote(req: NextRequest, token: string, noteId: string) {
  const context = await openDemoContext(req, token);
  const session = await getVisitorSession(context.link.id, context.visitorId);
  if (!session) throw new DemoLinkError("Esta nota no existe.", 404);

  const note = (await listNotes(session.id)).find((n) => n.id === noteId);
  if (!note) throw new DemoLinkError("Esta nota no existe.", 404);
  if (note.status !== "pending") {
    throw new DemoLinkError("Esta nota ya fue revisada y no se puede cambiar.", 409);
  }
  return { session, note };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { token, noteId } = await params;
    const { session } = await ownPendingNote(req, token, noteId);

    const input = updateClientNoteSchema.parse(await req.json());
    const note = await updateNote(noteId, session.id, {
      text: input.text,
      expected: input.expected,
      messageIds: input.messageIds,
    });

    return NextResponse.json({
      id: note.id,
      text: note.text,
      expected: note.expected,
      message_ids: note.message_ids,
      status: note.status,
      created_at: note.created_at,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { token, noteId } = await params;
    const { session } = await ownPendingNote(req, token, noteId);
    await deleteNote(noteId, session.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

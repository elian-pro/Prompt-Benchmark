import { NextRequest, NextResponse } from "next/server";

import { getVisitorSession } from "@/lib/db/demo-sessions";
import { createNote, listNotes } from "@/lib/db/demo-notes";
import { createClientNoteSchema } from "@/lib/schemas/demo-links";
import { DemoLinkError, openDemoContext, withVisitorCookie } from "@/lib/demo-link-guard";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * A finding the client reports: what is wrong, optionally what the bot should
 * have answered, anchored to the messages they tagged. Tagging replaces the
 * screenshot the old Google Doc asked for.
 *
 * Every note from here is born `pending`. Nothing a client writes reaches the
 * Editor without the user approving it first, which is the whole reason the
 * status column exists.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const context = await openDemoContext(req, token);

    const session = await getVisitorSession(context.link.id, context.visitorId);
    if (!session) {
      throw new DemoLinkError("Abre el chat antes de dejar una nota.", 409);
    }

    const input = createClientNoteSchema.parse(await req.json());
    // createNote checks that every tagged message belongs to this session, so
    // a note can never reference someone else's conversation.
    const note = await createNote(session.id, {
      text: input.text,
      expected: input.expected || null,
      messageIds: input.messageIds,
      source: "client",
      status: "pending",
    });

    const response = NextResponse.json({
      id: note.id,
      text: note.text,
      expected: note.expected,
      message_ids: note.message_ids,
      status: note.status,
      created_at: note.created_at,
    });
    return withVisitorCookie(response, context);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const context = await openDemoContext(req, token);

    const session = await getVisitorSession(context.link.id, context.visitorId);
    if (!session) return NextResponse.json({ notes: [] });

    const notes = await listNotes(session.id);
    return NextResponse.json({
      notes: notes.map((n) => ({
        id: n.id,
        text: n.text,
        expected: n.expected,
        message_ids: n.message_ids,
        status: n.status,
        created_at: n.created_at,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

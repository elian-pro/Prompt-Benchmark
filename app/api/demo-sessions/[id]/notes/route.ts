import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/db/demo-sessions";
import { createNote } from "@/lib/db/demo-notes";
import { createDemoNoteSchema } from "@/lib/schemas/demo-notes";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);

    const input = createDemoNoteSchema.parse(await req.json());
    const note = await createNote(id, { text: input.text, messageIds: input.messageIds });
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

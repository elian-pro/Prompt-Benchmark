import { NextRequest, NextResponse } from "next/server";
import { updateNote, deleteNote } from "@/lib/db/demo-notes";
import { updateDemoNoteSchema } from "@/lib/schemas/demo-notes";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; noteId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, noteId } = await params;
    const input = updateDemoNoteSchema.parse(await req.json());
    const note = await updateNote(noteId, id, input);
    return NextResponse.json(note);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, noteId } = await params;
    await deleteNote(noteId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  deleteSession,
  isSessionUnchanged,
  updateDraft,
} from "@/lib/db/chat-sessions";
import { updateDraftSchema } from "@/lib/schemas/chat-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);
    return NextResponse.json(session);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Manually updates the working draft (no AI turn). This is the "editar a
 * mano" path: the user edits the draft text directly instead of asking
 * Opus. Only an active session's draft can be changed.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta sesión ya no admite cambios.", 409);
    }
    const { draftContent } = updateDraftSchema.parse(await req.json());
    const updated = await updateDraft(id, draftContent);
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);

    // `onlyIfUnchanged` is the silent cleanup path fired when leaving a
    // session that never actually changed the prompt: it deletes only if
    // true, and no-ops otherwise. An explicit delete from the history list
    // omits it and always deletes.
    const onlyIfUnchanged = req.nextUrl.searchParams.get("onlyIfUnchanged") === "true";
    if (onlyIfUnchanged && !(await isSessionUnchanged(session))) {
      return NextResponse.json({ deleted: false });
    }

    await deleteSession(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

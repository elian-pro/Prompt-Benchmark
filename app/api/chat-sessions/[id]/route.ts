import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession, isSessionUnchanged } from "@/lib/db/chat-sessions";
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

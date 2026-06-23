import { NextRequest, NextResponse } from "next/server";
import { getSession, abandonSession } from "@/lib/db/chat-sessions";
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);
    // Soft delete: discarding a session marks it abandoned, keeping the chat
    // history (only uploaded files expire, per the Sprint 2 contract).
    return NextResponse.json(await abandonSession(id));
  } catch (err) {
    return handleError(err);
  }
}

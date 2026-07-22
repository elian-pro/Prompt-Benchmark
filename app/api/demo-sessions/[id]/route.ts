import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, updateSessionVersion, deleteSession } from "@/lib/db/demo-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ version_id: z.string().uuid("version_id debe ser un UUID.") });

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    return NextResponse.json(session);
  } catch (err) {
    return handleError(err);
  }
}

/** Switches the session's active version (starts a fresh round). Blocked when
 *  the session already has notes. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta conversación ya no admite cambios.", 409);
    }
    const { version_id } = patchSchema.parse(await req.json());
    return NextResponse.json(await updateSessionVersion(id, version_id));
  } catch (err) {
    return handleError(err);
  }
}

/** Permanently deletes the session (cascades to its messages and notes). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteSession(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, updateOpeningMessage } from "@/lib/db/demo-sessions";
import { updateOpeningMessageSchema } from "@/lib/schemas/demo-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Edits the opening (welcome) message after the chat has started. Only valid
 *  while the session is active and already has an opening message set. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta conversación ya no admite cambios.", 409);
    }
    if (!session.opening_message) {
      return jsonError("Esta conversación no tiene mensaje de inicio.", 400);
    }
    const { openingMessage } = updateOpeningMessageSchema.parse(await req.json());
    return NextResponse.json(await updateOpeningMessage(id, openingMessage));
  } catch (err) {
    return handleError(err);
  }
}

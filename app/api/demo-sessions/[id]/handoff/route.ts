import { NextRequest, NextResponse } from "next/server";
import { getSession, markSentToEditor } from "@/lib/db/demo-sessions";
import { createSession as createChatSession } from "@/lib/db/chat-sessions";
import { buildHandoffMessage } from "@/lib/prompts/playground-handoff";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * "Enviar al Editor": creates an Editor session on the exact version this
 * Playground conversation tested (not latest, not production), composes the
 * first message from the session's notes, and marks the Playground session
 * as handed off (Sprint 6, decision 6 / T4). The composed message is
 * returned, not persisted as a chat message — the client pre-fills the
 * Editor composer with it and the user sends it themselves.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta conversación ya fue enviada al Editor.", 409);
    }
    if (!session.version_id) {
      return jsonError("La versión probada ya no existe: no se puede enviar al Editor.", 409);
    }
    if (session.notes.length === 0) {
      return jsonError("Escribe al menos una nota antes de enviar al Editor.", 400);
    }

    const editorSession = await createChatSession({
      type: "editor",
      clientId: session.client_id,
      baseVersionId: session.version_id,
      sourceDemoSessionId: id,
    });

    await markSentToEditor(id, editorSession.id);

    const draftMessage = buildHandoffMessage(
      session.version_number_snapshot,
      session.notes,
      session.messages,
    );

    return NextResponse.json({ editorSessionId: editorSession.id, draftMessage });
  } catch (err) {
    return handleError(err);
  }
}

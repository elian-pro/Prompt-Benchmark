import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/db/demo-sessions";
import { getLink } from "@/lib/db/demo-links";
import { getClient } from "@/lib/db/clients";
import { createSession as createChatSession } from "@/lib/db/chat-sessions";
import { approvedNotes, buildHandoffMessage } from "@/lib/prompts/playground-handoff";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; sessionId: string }> };

/**
 * Sends a client's reviewed reports to the Editor.
 *
 * Two differences from the Playground handoff, both deliberate:
 *
 * Only approved notes travel, so a report the user has not read cannot become
 * an instruction to edit the prompt.
 *
 * The conversation is not marked `sent_to_editor`. On a demo link the client is
 * still on the other side and may keep testing; closing their chat because the
 * user acted on one report would be the wrong side effect. The Editor session
 * is still recorded on the conversation for traceability.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id, sessionId } = await params;

    const link = await getLink(id);
    if (!link) return jsonError("Link no encontrado.", 404);

    const session = await getSession(sessionId);
    if (!session || session.link_id !== id) {
      return jsonError("Conversación no encontrada.", 404);
    }
    if (!link.version_id) {
      return jsonError("La versión probada ya no existe: no se puede enviar al Editor.", 409);
    }

    const approved = approvedNotes(session.notes);
    if (approved.length === 0) {
      return jsonError("Aprueba al menos un reporte antes de enviar al Editor.", 400);
    }

    const editorSession = await createChatSession({
      type: "editor",
      clientId: link.client_id,
      // The version the client actually tested, not production and not latest.
      baseVersionId: link.version_id,
      sourceDemoSessionId: sessionId,
    });

    const client = await getClient(link.client_id);
    const draftMessage = buildHandoffMessage(
      link.version_number_snapshot,
      session.notes,
      session.messages,
      { source: "demo-link", clientName: client?.name ?? null },
    );

    return NextResponse.json({ editorSessionId: editorSession.id, draftMessage });
  } catch (err) {
    return handleError(err);
  }
}

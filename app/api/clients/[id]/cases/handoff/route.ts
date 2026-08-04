import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db/clients";
import { getVersion } from "@/lib/db/versions";
import {
  attachEditorSession,
  listCasesForConversation,
} from "@/lib/db/conversation-cases";
import { createSession as createChatSession } from "@/lib/db/chat-sessions";
import { transcriptOf } from "@/lib/conversation-turns";
import { buildReplayHandoff } from "@/lib/prompts/replay-handoff";
import { handoffSchema } from "@/lib/schemas/cases";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Hands one conversation's saved notes to the Editor, all in a single session,
 * the way the Playground sends its own. Every note stays its own case, so each
 * can be replayed and pass or fail on its own; what they share is the edit
 * they motivated.
 *
 * The composed message is returned rather than persisted, so the user reviews
 * it in the composer before it is sent.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    if (!client.chats_table) {
      return jsonError("Este cliente no tiene historial conectado.", 409);
    }

    const input = handoffSchema.parse(await req.json());
    const cases = await listCasesForConversation(id, client.chats_table, input.rowId);
    if (cases.length === 0) {
      return jsonError("Guarda al menos una nota antes de enviar al Editor.", 400);
    }

    // Every note of a conversation is filed against the version that was in
    // production when it was written, and they are written minutes apart, so
    // the first one names the version for all of them.
    const version = cases[0].version_id ? await getVersion(cases[0].version_id) : null;
    if (!version) {
      return jsonError("La versión que se marcó ya no existe.", 409);
    }

    const editorSession = await createChatSession({
      type: "editor",
      clientId: id,
      baseVersionId: version.id,
    });
    await attachEditorSession(
      cases.map((c) => c.id),
      editorSession.id,
    );

    const { turns } = transcriptOf({
      turnos: cases[0].turnos_snapshot,
      historial: cases[0].historial_snapshot,
    });
    const stale =
      cases[0].conversation_at != null &&
      new Date(cases[0].conversation_at) < new Date(version.created_at);

    const draftMessage = buildReplayHandoff({
      clientName: client.name,
      versionNumber: version.version_number,
      turns,
      notes: cases.map((c) => ({ nota: c.nota, marcados: c.turnos_marcados })),
      idDeKommo: cases[0].id_de_kommo,
      conversationAt: cases[0].conversation_at,
      stale,
    });

    return NextResponse.json({ editorSessionId: editorSession.id, draftMessage, stale });
  } catch (err) {
    return handleError(err);
  }
}

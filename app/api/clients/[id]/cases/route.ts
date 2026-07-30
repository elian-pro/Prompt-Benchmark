import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db/clients";
import { getConversation } from "@/lib/db/chats-history";
import { listVersions } from "@/lib/db/versions";
import { createCase } from "@/lib/db/conversation-cases";
import { createSession as createChatSession } from "@/lib/db/chat-sessions";
import { transcriptOf } from "@/lib/conversation-turns";
import { buildReplayHandoff } from "@/lib/prompts/replay-handoff";
import { createCaseSchema } from "@/lib/schemas/cases";
import { isChatsConfigured } from "@/lib/supabase";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Files a real conversation as a case and opens an Editor session on it.
 *
 * The case is stored before the response so the record survives even if the
 * user closes the Editor without sending anything: the point is to accumulate
 * evidence, not only to start a chat. The composed message is returned rather
 * than persisted, same as the Playground handoff, so the user reviews it in
 * the composer before it is sent.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    if (!isChatsConfigured()) {
      return jsonError("La conexión con la base de historial no está configurada.", 503);
    }
    if (!client.chats_table) {
      return jsonError("Este cliente no tiene historial conectado.", 409);
    }

    const input = createCaseSchema.parse(await req.json());

    // Read the row again instead of trusting the client: the snapshot has to
    // be what is actually stored, and row_id is the only thing we accept.
    const row = await getConversation(client.chats_table, input.rowId);
    if (!row) return jsonError("La conversación ya no existe.", 404);

    const production = (await listVersions(id)).find((v) => v.is_production);
    if (!production) {
      return jsonError(
        "Este cliente no tiene una versión en producción: no hay contra qué juzgar la conversación.",
        409,
      );
    }

    const { turns } = transcriptOf(row);
    // A conversation older than the version it is judged against may have been
    // produced by a different prompt. Surfaced instead of blocked: it is often
    // still the right case to work on, but the Editor must not assume.
    const stale = new Date(row.created_at) < new Date(production.created_at);

    const editorSession = await createChatSession({
      type: "editor",
      clientId: id,
      baseVersionId: production.id,
    });

    await createCase({
      clientId: id,
      chatsTable: client.chats_table,
      rowId: row.id,
      idDeKommo: row.id_de_kommo,
      conversationAt: row.created_at,
      historialSnapshot: row.historial,
      turnosSnapshot: row.turnos ?? null,
      versionId: production.id,
      turnoIndex: input.turnoIndex ?? null,
      nota: input.nota,
      editorSessionId: editorSession.id,
    });

    const draftMessage = buildReplayHandoff({
      clientName: client.name,
      versionNumber: production.version_number,
      turns,
      failedAt: input.turnoIndex ?? null,
      nota: input.nota,
      idDeKommo: row.id_de_kommo,
      conversationAt: row.created_at,
      stale,
    });

    return NextResponse.json({ editorSessionId: editorSession.id, draftMessage, stale });
  } catch (err) {
    return handleError(err);
  }
}

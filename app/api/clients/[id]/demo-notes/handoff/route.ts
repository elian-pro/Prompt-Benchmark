import { NextRequest, NextResponse } from "next/server";

import { getClient } from "@/lib/db/clients";
import { listVersions } from "@/lib/db/versions";
import { listClientNotes, markNotesSent } from "@/lib/db/demo-notes";
import { createSession as createChatSession } from "@/lib/db/chat-sessions";
import { approvedNotes, buildClientBatchHandoff } from "@/lib/prompts/playground-handoff";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Hands every approved report of a client to the Editor as one document.
 *
 * The per conversation handoff opens the Editor on the version that
 * conversation tested, because there is only one. A batch usually crosses
 * versions, so it opens on the newest one the reports were written against and
 * the document says which version each group belongs to: editing the older text
 * would quietly undo whatever the newer one already fixed.
 *
 * No `sourceDemoSessionId`: the batch does not come from one conversation, and
 * naming any single one of them would be a wrong trace rather than a missing
 * one.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);

    const notes = await listClientNotes(id);
    const sendable = approvedNotes(notes);
    if (sendable.length === 0) {
      const already = notes.some((n) => n.sent_to_editor_at);
      return jsonError(
        already
          ? "Ya enviaste al Editor todos los reportes aprobados de este cliente."
          : "Aprueba al menos un reporte antes de enviar al Editor.",
        400,
      );
    }

    // Already newest first, so the first hit is the most recent version any of
    // these reports was written against.
    const versions = await listVersions(id);
    const versionIds = new Set(sendable.map((n) => n.version_id));
    const base = versions.find((v) => versionIds.has(v.id));
    if (!base) {
      return jsonError("Las versiones que se probaron ya no existen: no se puede enviar.", 409);
    }

    const editorSession = await createChatSession({
      type: "editor",
      clientId: id,
      baseVersionId: base.id,
    });

    const draftMessage = buildClientBatchHandoff(client.name, sendable);
    await markNotesSent(
      sendable.map((n) => n.id),
      editorSession.id,
    );

    return NextResponse.json({ editorSessionId: editorSession.id, draftMessage });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, finalizeSession } from "@/lib/db/chat-sessions";
import { createVersion, saveCreatorVersion, type Version } from "@/lib/db/versions";
import { createClient, getClient } from "@/lib/db/clients";
import { extractChangeSummary, extractPromptFromReply } from "@/lib/prompts/editor-persona";
import { finalizeCreatorSchema } from "@/lib/schemas/chat-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Commits the session's current draft to the Library and closes the session as
 * finalized. Branches by session type:
 *  - editor:  a new MINOR version on the existing client (`editor_chat`).
 *  - creator: onto the target client when the session has one (see
 *             saveCreatorVersion), otherwise a brand-new client at v1.0
 *             carrying the prompt, with metadata from the request body.
 * Idempotency is not attempted: a finalized or abandoned session is rejected.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);

    if (session.status !== "active") {
      return jsonError("Solo se puede finalizar una sesión activa.", 409);
    }
    const draft = session.current_draft_content?.trim();
    if (!draft) {
      return jsonError("El prompt está vacío; no hay nada que finalizar.", 400);
    }

    if (session.type === "creator") {
      const input = finalizeCreatorSchema.parse(await req.json().catch(() => ({})));
      // The body wins over the target picked at session start, so the modal can
      // still change its mind.
      const targetId = input.clientId ?? session.client_id;

      let client: { id: string; name: string };
      let version: Version;
      if (targetId) {
        const target = await getClient(targetId);
        if (!target) return jsonError("El cliente ya no existe.", 404);
        client = target;
        version = await saveCreatorVersion(target.id, draft, id);
      } else {
        const created = await createClient({
          name: input.name!,
          segment: input.segment ?? null,
          initialVersion: { content: draft, source: "creator_chat", sourceSessionId: id },
        });
        // initialVersion was provided, so the seed always runs and version is set.
        if (!created.version) {
          throw new Error("No se pudo crear la versión inicial del cliente.");
        }
        client = created.client;
        version = created.version;
      }
      const finalized = await finalizeSession(id, version.id, client.id);
      return NextResponse.json({ session: finalized, version, client });
    }

    // Editor: the session already belongs to a client.
    if (!session.client_id) {
      return jsonError("La sesión no tiene un cliente asociado.", 409);
    }
    // The summary belongs to the assistant turn that produced this draft: the
    // most recent one carrying a prompt block (later turns may be plain Q&A).
    // extractPromptFromReply recognizes both the sentinel contract (Sprint 9+)
    // and the legacy ``` fence format, so this matches whichever the message
    // actually used instead of assuming fences.
    let changeSummary: string | null = null;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m.role === "assistant" && extractPromptFromReply(m.content) !== null) {
        changeSummary = extractChangeSummary(m.content);
        break;
      }
    }
    const version = await createVersion(session.client_id, draft, {
      bumpType: "minor",
      source: "editor_chat",
      sourceSessionId: id,
      changeSummary,
    });
    const finalized = await finalizeSession(id, version.id);
    return NextResponse.json({ session: finalized, version });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, finalizeSession } from "@/lib/db/chat-sessions";
import { createVersion } from "@/lib/db/versions";
import { createClient } from "@/lib/db/clients";
import { finalizeCreatorSchema } from "@/lib/schemas/chat-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Commits the session's current draft to the Library and closes the session as
 * finalized. Branches by session type:
 *  - editor:  a new MINOR version on the existing client (`editor_chat`).
 *  - creator: a brand-new client at v1.0 carrying the prompt (`creator_chat`),
 *             with metadata (name, segment) from the request body.
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
      const { client, version } = await createClient({
        name: input.name,
        segment: input.segment ?? null,
        initialVersion: { content: draft, source: "creator_chat", sourceSessionId: id },
      });
      const finalized = await finalizeSession(id, version.id, client.id);
      return NextResponse.json({ session: finalized, version, client });
    }

    // Editor: the session already belongs to a client.
    if (!session.client_id) {
      return jsonError("La sesión no tiene un cliente asociado.", 409);
    }
    const version = await createVersion(session.client_id, draft, {
      bumpType: "minor",
      source: "editor_chat",
      sourceSessionId: id,
    });
    const finalized = await finalizeSession(id, version.id);
    return NextResponse.json({ session: finalized, version });
  } catch (err) {
    return handleError(err);
  }
}

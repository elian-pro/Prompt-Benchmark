import { NextRequest, NextResponse } from "next/server";
import { getSession, finalizeSession } from "@/lib/db/chat-sessions";
import { createVersion } from "@/lib/db/versions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Commits the session's current draft as a new minor version in the Library
 * (`source: 'editor_chat'`, linked back via `source_session_id`) and closes
 * the session as finalized. Idempotency is not attempted: a finalized or
 * abandoned session is rejected.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);

    if (session.status !== "active") {
      return jsonError("Solo se puede finalizar una sesión activa.", 409);
    }
    if (!session.client_id) {
      return jsonError("La sesión no tiene un cliente asociado.", 409);
    }
    const draft = session.current_draft_content?.trim();
    if (!draft) {
      return jsonError("El borrador está vacío; no hay nada que finalizar.", 400);
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

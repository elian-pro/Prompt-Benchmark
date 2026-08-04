import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/db/demo-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; sessionId: string }> };

/**
 * One client conversation, read only, for the admin's right hand column.
 *
 * The session id is checked against the link in the URL rather than trusted on
 * its own, so a stale link id cannot pull up a conversation from a different
 * client.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id, sessionId } = await params;
    const session = await getSession(sessionId);
    if (!session || session.link_id !== id) {
      return jsonError("Conversación no encontrada.", 404);
    }
    return NextResponse.json(session);
  } catch (err) {
    return handleError(err);
  }
}

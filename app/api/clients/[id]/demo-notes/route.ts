import { NextRequest, NextResponse } from "next/server";

import { getClient } from "@/lib/db/clients";
import { listClientNotes } from "@/lib/db/demo-notes";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Every report this client wrote, across all of their links and conversations.
 *
 * Reviewing them is still the existing per note route
 * (`/api/demo-links/[id]/sessions/[sessionId]/notes/[noteId]`), which authorizes
 * by the full path. This one only reads, so the inbox can show what the reports
 * say instead of how many there are.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);

    return NextResponse.json(await listClientNotes(id));
  } catch (err) {
    return handleError(err);
  }
}

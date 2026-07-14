import { NextRequest, NextResponse } from "next/server";
import { getSession, resetSession } from "@/lib/db/demo-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Starts a fresh conversation round ("empezar de cero"). Messages are not
 * deleted; the chat just shows the new round. Notes persist.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta conversación ya no admite cambios.", 409);
    }
    return NextResponse.json(await resetSession(id));
  } catch (err) {
    return handleError(err);
  }
}

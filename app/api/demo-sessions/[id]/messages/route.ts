import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/db/demo-sessions";
import { appendDemoMessageSchema } from "@/lib/schemas/demo-sessions";
import { runDemoTurn } from "@/lib/demo-turn";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Sends the human's message and returns the client bot's reply in one round
 * trip. Not streamed: the bot's JSON envelope must be parsed whole before
 * anything is shown (same reasoning as the Adversarial run engine), so the
 * client just shows "Escribiendo…" while this request is in flight. Persists
 * both turns to `demo_messages`.
 *
 * The turn itself lives in `lib/demo-turn.ts`, shared with the public client
 * demo link so both conversations behave identically.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta conversación ya no admite más mensajes.", 409);
    }

    const input = appendDemoMessageSchema.parse(await req.json());
    const result = await runDemoTurn(session, input.content);
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

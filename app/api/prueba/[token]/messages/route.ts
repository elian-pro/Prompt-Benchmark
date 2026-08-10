import { NextRequest, NextResponse } from "next/server";

import { getSession, getVisitorSession, touchVisitorSession } from "@/lib/db/demo-sessions";
import { countSessionMessages } from "@/lib/db/demo-links";
import { appendDemoMessageSchema } from "@/lib/schemas/demo-sessions";
import { runDemoTurn } from "@/lib/demo-turn";
import {
  assertMessageCap,
  assertMessageRate,
  DemoLinkError,
  openDemoContext,
  withVisitorCookie,
} from "@/lib/demo-link-guard";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";
// A turn with tools is several model calls plus their HTTP round trips.
export const maxDuration = 120;

type Params = { params: Promise<{ token: string }> };

/**
 * The client sends a message and gets the bot's reply, exactly as the
 * Playground does (`runDemoTurn` is the same code).
 *
 * Order matters here. The rate limit is checked before anything hits the
 * database, and the per conversation cap before the model is called, because
 * this is the one endpoint in the project where an unauthenticated caller
 * spends money.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const context = await openDemoContext(req, token);
    assertMessageRate(context);

    const session = await getVisitorSession(context.link.id, context.visitorId);
    if (!session) {
      throw new DemoLinkError("Abre el chat antes de enviar un mensaje.", 409);
    }

    assertMessageCap(context.link, await countSessionMessages(session.id));

    const input = appendDemoMessageSchema.parse(await req.json());
    const detail = await getSession(session.id);
    if (!detail) throw new DemoLinkError("Esta conversación ya no existe.", 404);

    const { humanMessage, botMessage } = await runDemoTurn(detail, input.content);
    await touchVisitorSession(session.id, context.ip);

    const response = NextResponse.json({
      humanMessage: {
        id: humanMessage.id,
        role: humanMessage.role,
        content: humanMessage.content,
        turn_number: humanMessage.turn_number,
        created_at: humanMessage.created_at,
      },
      botMessage: {
        id: botMessage.id,
        role: botMessage.role,
        content: botMessage.content,
        turn_number: botMessage.turn_number,
        created_at: botMessage.created_at,
      },
    });
    return withVisitorCookie(response, context);
  } catch (err) {
    return handleError(err);
  }
}

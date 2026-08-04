import { NextRequest, NextResponse } from "next/server";

import { getVisitorSession, resetSession, touchVisitorSession } from "@/lib/db/demo-sessions";
import {
  assertMessageRate,
  DemoLinkError,
  openDemoContext,
  withVisitorCookie,
} from "@/lib/demo-link-guard";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * Starts the conversation over: bumps the round, replays the opening message.
 *
 * The old messages are not deleted, they drop out of the view. That matters
 * twice over here. The reports the client already sent keep pointing at the
 * exact message they were about, and the record of what was said survives a
 * client who resets to "clean up" before someone else looks.
 *
 * The message cap counts every round on purpose (see `countSessionMessages`),
 * so resetting is not a way around it, and the rate limiter applies as well:
 * without it, reset is a free row insert on an endpoint with no login.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const context = await openDemoContext(req, token);
    assertMessageRate(context);

    const session = await getVisitorSession(context.link.id, context.visitorId);
    if (!session) throw new DemoLinkError("Todavía no hay nada que reiniciar.", 409);

    await resetSession(session.id);
    await touchVisitorSession(session.id, context.ip);

    return withVisitorCookie(NextResponse.json({ ok: true }), context);
  } catch (err) {
    return handleError(err);
  }
}

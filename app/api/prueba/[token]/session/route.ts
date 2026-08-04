import { NextRequest, NextResponse } from "next/server";

import {
  createLinkSession,
  getSession,
  getVisitorSession,
  touchVisitorSession,
} from "@/lib/db/demo-sessions";
import { countLinkSessions } from "@/lib/db/demo-links";
import {
  assertSessionCap,
  openDemoContext,
  withVisitorCookie,
  type DemoContext,
} from "@/lib/demo-link-guard";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * The client's own conversation on a demo link, created on first visit and
 * resumed after that.
 *
 * This route is public: the middleware does not run on `/api/prueba`. Nothing
 * here reads the database before `openDemoContext` has resolved the token and
 * the visitor cookie, and everything it returns is scoped to that one
 * conversation. There is deliberately no way to ask this endpoint about anyone
 * else's.
 */
async function loadOrCreate(context: DemoContext) {
  const existing = await getVisitorSession(context.link.id, context.visitorId);
  if (existing) {
    await touchVisitorSession(existing.id, context.ip);
    return existing;
  }

  assertSessionCap(context.link, await countLinkSessions(context.link.id));

  return createLinkSession({
    linkId: context.link.id,
    clientId: context.link.client_id,
    versionId: context.link.version_id,
    versionNumberSnapshot: context.link.version_number_snapshot,
    // The link's frozen prompt, never the version as it stands now: the client
    // has to be testing what they were told they are testing.
    promptSnapshot: context.link.prompt_snapshot,
    openingMessage: context.link.opening_message,
    visitorId: context.visitorId,
    visitorIp: context.ip,
    visitorUserAgent: context.userAgent,
  });
}

/** What the public page renders. Only this visitor's own messages and notes,
 *  plus the client name for the header. Never the prompt, never the version
 *  number, never another conversation. */
function publicView(detail: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return {
    id: detail.id,
    client_name: detail.client_name,
    messages: detail.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      turn_number: m.turn_number,
      created_at: m.created_at,
    })),
    notes: detail.notes.map((n) => ({
      id: n.id,
      text: n.text,
      expected: n.expected,
      message_ids: n.message_ids,
      status: n.status,
      created_at: n.created_at,
    })),
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const context = await openDemoContext(req, token);
    const session = await loadOrCreate(context);
    const detail = await getSession(session.id);
    if (!detail) throw new Error("No se pudo cargar la conversación.");

    const response = NextResponse.json(publicView(detail));
    return withVisitorCookie(response, context);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const context = await openDemoContext(req, token);

    // A GET never creates: a crawler unfurling the link preview must not burn
    // one of the link's conversations.
    const existing = await getVisitorSession(context.link.id, context.visitorId);
    if (!existing) return NextResponse.json({ id: null, messages: [], notes: [] });

    const detail = await getSession(existing.id);
    if (!detail) return NextResponse.json({ id: null, messages: [], notes: [] });
    return NextResponse.json(publicView(detail));
  } catch (err) {
    return handleError(err);
  }
}

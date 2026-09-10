import { NextRequest, NextResponse } from "next/server";

import {
  closeLink,
  deleteLink,
  getLink,
  listLinkSessions,
  reopenLink,
  updateLink,
} from "@/lib/db/demo-links";
import { syncLinkOpeningMessage } from "@/lib/db/demo-sessions";
import { getClient } from "@/lib/db/clients";
import { updateDemoLinkSchema } from "@/lib/schemas/demo-links";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One link with its conversations, which is what the detail page lists on the
 *  left. The prompt snapshot is not sent: the page never shows it, and it is
 *  the largest field on the row. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const link = await getLink(id);
    if (!link) return jsonError("Link no encontrado.", 404);

    const { prompt_snapshot: _p, ...rest } = link;
    const client = await getClient(link.client_id);

    return NextResponse.json({
      ...rest,
      client_name: client?.name ?? null,
      sessions: await listLinkSessions(id),
    });
  } catch (err) {
    return handleError(err);
  }
}

/** Closing revokes the URL without touching what was said through it; the
 *  other fields are the link's settings. A request carries only what the user
 *  just changed, and a field left out of it is left alone. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { status, expiresOn, label, openingMessage, maxSessions, maxMessages } =
      updateDemoLinkSchema.parse(await req.json());

    let link = await getLink(id);
    if (!link) return jsonError("Link no encontrado.", 404);

    const patch: Parameters<typeof updateLink>[1] = {};
    if (expiresOn !== undefined) patch.expires_on = expiresOn;
    if (label !== undefined) patch.label = label || null;
    if (openingMessage !== undefined) patch.opening_message = openingMessage || null;
    if (maxSessions !== undefined) patch.max_sessions = maxSessions;
    if (maxMessages !== undefined) patch.max_messages = maxMessages;

    if (Object.keys(patch).length > 0) link = await updateLink(id, patch);
    // The link's greeting only reaches new conversations on its own; the ones
    // already opened copied the old text when they started.
    if (patch.opening_message !== undefined) {
      await syncLinkOpeningMessage(id, patch.opening_message);
    }
    if (status !== undefined) link = status === "closed" ? await closeLink(id) : await reopenLink(id);

    return NextResponse.json(link);
  } catch (err) {
    return handleError(err);
  }
}

/** Deletes the link and every conversation under it. The UI puts this behind
 *  the two-step confirmation because it is the only way a client's demo
 *  conversation is ever destroyed. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteLink(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";

import {
  closeLink,
  deleteLink,
  getLink,
  listLinkSessions,
  reopenLink,
  setLinkExpiry,
} from "@/lib/db/demo-links";
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

/** Closing revokes the URL without touching what was said through it; moving
 *  the deadline changes when it revokes itself. A request carries whichever of
 *  the two the user just decided, and both are applied when it carries both. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { status, expiresOn } = updateDemoLinkSchema.parse(await req.json());

    let link = await getLink(id);
    if (!link) return jsonError("Link no encontrado.", 404);

    if (expiresOn !== undefined) link = await setLinkExpiry(id, expiresOn);
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

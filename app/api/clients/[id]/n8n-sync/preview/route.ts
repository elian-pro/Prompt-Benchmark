import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listBindings } from "@/lib/db/n8n-bindings";
import { getVersion } from "@/lib/db/versions";
import { previewPush } from "@/lib/n8n/sync";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ version_id: z.string().uuid() });

type Params = { params: Promise<{ id: string }> };

/**
 * Previews what promoting `version_id` would push to each API binding of the
 * client: current vs next text, warnings, and any locate errors. Reads n8n
 * live; writes nothing.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { version_id } = schema.parse(await req.json());

    const version = await getVersion(version_id);
    if (!version || version.client_id !== id) return jsonError("Versión no encontrada.", 404);

    const bindings = (await listBindings(id)).filter((b) => b.mode === "api" && b.sync_enabled);
    const previews = await Promise.all(bindings.map((b) => previewPush(b, version.content)));
    return NextResponse.json(previews);
  } catch (err) {
    return handleError(err);
  }
}

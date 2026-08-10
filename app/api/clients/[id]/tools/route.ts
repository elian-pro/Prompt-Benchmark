import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db/clients";
import { listTools, createTool } from "@/lib/db/client-tools";
import { createToolSchema } from "@/lib/schemas/client-tools";
import { assertAllowedUrl } from "@/lib/client-tools";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The client's tools, with header values masked. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    return NextResponse.json(await listTools(id));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    const input = createToolSchema.parse(await req.json());
    // Same check the executor runs before every call: rejecting it here is
    // what turns it into a form error instead of a broken conversation.
    assertAllowedUrl(input.url);
    return NextResponse.json(await createTool(id, input), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

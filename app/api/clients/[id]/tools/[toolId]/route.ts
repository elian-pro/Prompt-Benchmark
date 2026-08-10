import { NextRequest, NextResponse } from "next/server";
import { updateTool, deleteTool } from "@/lib/db/client-tools";
import { updateToolSchema } from "@/lib/schemas/client-tools";
import { assertAllowedUrl } from "@/lib/client-tools";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; toolId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, toolId } = await params;
    const input = updateToolSchema.parse(await req.json());
    if (input.url) assertAllowedUrl(input.url);
    // Scoped by client too: a tool id from another client must not resolve.
    return NextResponse.json(await updateTool(id, toolId, input));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, toolId } = await params;
    await deleteTool(id, toolId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

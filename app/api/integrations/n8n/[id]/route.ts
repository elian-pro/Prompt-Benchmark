import { NextRequest, NextResponse } from "next/server";
import { getConnection, updateConnection, deleteConnection } from "@/lib/db/n8n-connections";
import { updateConnectionSchema } from "@/lib/schemas/n8n";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await getConnection(id);
    if (!existing) return jsonError("Conexión n8n no encontrada.", 404);
    const input = updateConnectionSchema.parse(await req.json());
    const updated = await updateConnection(id, input);
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteConnection(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

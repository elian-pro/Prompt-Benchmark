import { NextRequest, NextResponse } from "next/server";
import { getBinding, deleteBinding } from "@/lib/db/n8n-bindings";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; bindingId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, bindingId } = await params;
    const binding = await getBinding(bindingId);
    if (!binding || binding.client_id !== id) {
      return jsonError("Vínculo n8n no encontrado.", 404);
    }
    await deleteBinding(bindingId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

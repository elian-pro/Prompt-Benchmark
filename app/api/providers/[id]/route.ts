import { NextRequest, NextResponse } from "next/server";
import { getProvider, updateProvider, deleteProvider } from "@/lib/db/providers";
import { updateProviderSchema } from "@/lib/schemas/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const provider = await getProvider(id);
    if (!provider) return jsonError("Proveedor no encontrado.", 404);
    return NextResponse.json(provider);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await getProvider(id);
    if (!existing) return jsonError("Proveedor no encontrado.", 404);
    const input = updateProviderSchema.parse(await req.json());
    const updated = await updateProvider(id, input);
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteProvider(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

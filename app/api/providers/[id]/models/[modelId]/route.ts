import { NextRequest, NextResponse } from "next/server";
import { toggleModel, removeModel } from "@/lib/db/providers";
import { toggleModelSchema } from "@/lib/schemas/providers";
import { handleError } from "@/lib/http";

type Params = { params: Promise<{ id: string; modelId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { modelId } = await params;
    const { enabled } = toggleModelSchema.parse(await req.json());
    const updated = await toggleModel(modelId, enabled);
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { modelId } = await params;
    await removeModel(modelId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

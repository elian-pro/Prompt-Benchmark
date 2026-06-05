import { NextRequest, NextResponse } from "next/server";
import { listModels, addModel } from "@/lib/db/providers";
import { addModelSchema } from "@/lib/schemas/providers";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json(await listModels(id));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const input = addModelSchema.parse(await req.json());
    const created = await addModel(id, input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

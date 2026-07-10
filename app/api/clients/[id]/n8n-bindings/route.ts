import { NextRequest, NextResponse } from "next/server";
import { listBindings, createApiBinding } from "@/lib/db/n8n-bindings";
import { createApiBindingSchema } from "@/lib/schemas/n8n";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json(await listBindings(id));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const input = createApiBindingSchema.parse(await req.json());
    const created = await createApiBinding(id, input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

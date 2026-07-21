import { NextRequest, NextResponse } from "next/server";
import { listBindings, createApiBinding, createManualBinding } from "@/lib/db/n8n-bindings";
import { createApiBindingSchema, createManualBindingSchema } from "@/lib/schemas/n8n";
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

/**
 * Creates a binding. Body shape decides the mode: `mode: "manual"` (with
 * manual_label) creates a manual target; anything else is treated as the
 * API-mode shape (connection_id, workflow_id, node_id, ...).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (body?.mode === "manual") {
      const input = createManualBindingSchema.parse(body);
      const created = await createManualBinding(id, input);
      return NextResponse.json(created, { status: 201 });
    }
    const input = createApiBindingSchema.parse(body);
    const created = await createApiBinding(id, input);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

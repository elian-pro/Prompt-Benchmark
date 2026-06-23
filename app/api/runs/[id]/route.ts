import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/db/runs";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const run = await getRun(id);
    if (!run) return jsonError("Prueba no encontrada.", 404);
    return NextResponse.json(run);
  } catch (err) {
    return handleError(err);
  }
}

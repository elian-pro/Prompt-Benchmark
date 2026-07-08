import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/db/demo-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    return NextResponse.json(session);
  } catch (err) {
    return handleError(err);
  }
}

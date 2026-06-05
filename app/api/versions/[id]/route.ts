import { NextRequest, NextResponse } from "next/server";
import { getVersion } from "@/lib/db/versions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const version = await getVersion(id);
    if (!version) return jsonError("Versión no encontrada.", 404);
    return NextResponse.json(version);
  } catch (err) {
    return handleError(err);
  }
}

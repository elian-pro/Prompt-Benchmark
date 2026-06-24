import { NextRequest, NextResponse } from "next/server";
import { getVersion, listVersions, deleteVersion } from "@/lib/db/versions";
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const version = await getVersion(id);
    if (!version) return jsonError("Versión no encontrada.", 404);
    if (version.is_production) {
      return jsonError(
        "No se puede eliminar la versión de producción. Promueve otra primero.",
        409,
      );
    }
    const siblings = await listVersions(version.client_id);
    if (siblings.length <= 1) {
      return jsonError("No se puede eliminar la única versión del cliente.", 409);
    }
    await deleteVersion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

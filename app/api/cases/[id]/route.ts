import { NextRequest, NextResponse } from "next/server";
import { getCase, setCaseResolution } from "@/lib/db/conversation-cases";
import { getVersion } from "@/lib/db/versions";
import { resolveCaseSchema } from "@/lib/schemas/cases";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * The verdict on a case, set by a person after reading the replay's two
 * replies. `resolvedVersionId: null` reopens it, which is what a later version
 * breaking the case again looks like.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const kase = await getCase(id);
    if (!kase) return jsonError("Caso no encontrado.", 404);

    const input = resolveCaseSchema.parse(await req.json());

    if (input.resolvedVersionId) {
      const version = await getVersion(input.resolvedVersionId);
      if (!version) return jsonError("Esa versión no existe.", 404);
      if (version.client_id !== kase.client_id) {
        return jsonError("Esa versión es de otro cliente.", 400);
      }
    }

    const updated = await setCaseResolution(id, input.resolvedVersionId ?? null);
    return NextResponse.json({
      resolved_version_id: updated.resolved_version_id,
      resolved_at: updated.resolved_at,
    });
  } catch (err) {
    return handleError(err);
  }
}

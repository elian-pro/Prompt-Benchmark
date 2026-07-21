import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBinding, markBindingDeployed } from "@/lib/db/n8n-bindings";
import { getVersion } from "@/lib/db/versions";
import { logSyncEvent } from "@/lib/db/n8n-sync-events";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ version_id: z.string().uuid() });

type Params = { params: Promise<{ id: string; bindingId: string }> };

/**
 * "Marcar como actualizado" for a manual binding: the human already pasted
 * the prompt into the client's own n8n by hand. Records which version they
 * confirmed so the pending-deploy reminder clears.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id, bindingId } = await params;
    const binding = await getBinding(bindingId);
    if (!binding || binding.client_id !== id) {
      return jsonError("Vínculo n8n no encontrado.", 404);
    }
    if (binding.mode !== "manual") {
      return jsonError("Este vínculo no es manual.", 400);
    }

    const { version_id } = schema.parse(await req.json());
    const version = await getVersion(version_id);
    if (!version || version.client_id !== id) return jsonError("Versión no encontrada.", 404);

    const nowIso = new Date().toISOString();
    await markBindingDeployed(bindingId, { versionId: version.id, deployedAt: nowIso });
    await logSyncEvent({
      binding_id: bindingId,
      client_id: id,
      version_id: version.id,
      action: "manual_confirm",
      status: "success",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

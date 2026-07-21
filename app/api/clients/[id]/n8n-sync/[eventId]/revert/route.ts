import { NextRequest, NextResponse } from "next/server";
import { getSyncEvent } from "@/lib/db/n8n-sync-events";
import { getBinding } from "@/lib/db/n8n-bindings";
import { revertPush } from "@/lib/n8n/sync";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; eventId: string }> };

/**
 * Reverts a successful push event: writes its `previous_content` back into
 * the bound node. Only successful "push" events carry a usable snapshot.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id, eventId } = await params;
    const event = await getSyncEvent(eventId);
    if (!event || event.client_id !== id) return jsonError("Evento no encontrado.", 404);
    if (event.action !== "push" || event.status !== "success") {
      return jsonError("Solo se puede revertir un push exitoso.", 400);
    }
    if (!event.binding_id) return jsonError("El vínculo de este evento ya no existe.", 400);

    const binding = await getBinding(event.binding_id);
    if (!binding || binding.client_id !== id) return jsonError("Vínculo n8n no encontrado.", 404);

    const outcome = await revertPush(binding, { previous_content: event.previous_content });
    if (outcome.status === "error") return jsonError(outcome.message ?? "No se pudo revertir.", 502);
    return NextResponse.json(outcome);
  } catch (err) {
    return handleError(err);
  }
}

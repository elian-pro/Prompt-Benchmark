import { NextRequest, NextResponse } from "next/server";
import { getCase } from "@/lib/db/conversation-cases";
import { getVersion, listVersions } from "@/lib/db/versions";
import { getRoleDefault } from "@/lib/db/role-defaults";
import { RoleNotConfiguredError } from "@/lib/db/runs";
import { transcriptOf } from "@/lib/conversation-turns";
import { buildReplayPlan, isReplayable } from "@/lib/replay";
import { replayCaseSchema } from "@/lib/schemas/cases";
import { chat, type ChatMessage } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Re-runs the turn that failed against a candidate version, and returns both
 * replies so they can be compared.
 *
 * Scope, stated here because it is easy to expect more: this answers ONE turn.
 * A whole conversation cannot be replayed, because as soon as the bot says
 * something different the real lead's next message no longer follows from it.
 * It also runs with prompt and history only, so a difference caused by a tool,
 * a CRM field or RAG will not reproduce.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const kase = await getCase(id);
    if (!kase) return jsonError("Caso no encontrado.", 404);
    if (kase.turno_index == null) {
      return jsonError(
        "Este caso no tiene marcado el turno que falló, así que no hay qué volver a correr.",
        409,
      );
    }

    const body = await req.json().catch(() => ({}));
    const input = replayCaseSchema.parse(body);

    // Default to whatever is in production now: the point of a replay is
    // usually "did the change I just promoted fix this?".
    const version = input.versionId
      ? await getVersion(input.versionId)
      : ((await listVersions(kase.client_id)).find((v) => v.is_production) ?? null);
    if (!version) return jsonError("No hay versión contra la cual correr el caso.", 409);
    if (version.client_id !== kase.client_id) {
      return jsonError("Esa versión es de otro cliente.", 400);
    }

    // The snapshot, not the live row: the case is judged against what it was
    // when it was filed, even if the agents kept writing to that conversation.
    const { turns } = transcriptOf({
      turnos: kase.turnos_snapshot,
      historial: kase.historial_snapshot,
    });
    const plan = buildReplayPlan(turns, kase.turno_index);
    if (!isReplayable(plan)) {
      return jsonError(
        "El turno marcado no tiene un mensaje del lead antes, así que no hay nada que responder.",
        409,
      );
    }

    const role = await getRoleDefault("test_bot");
    if (!role) {
      throw new RoleNotConfiguredError(
        "No hay un modelo asignado al rol Bot de prueba. Configúralo en Configuración.",
      );
    }

    const reply = await chat({
      providerId: role.provider_id,
      modelName: role.model_name,
      systemPrompt: version.content,
      messages: plan.messages as ChatMessage[],
      temperature: role.temperature ?? undefined,
      topP: role.top_p ?? undefined,
      maxTokens: role.max_tokens ?? undefined,
    });

    return NextResponse.json({
      versionId: version.id,
      versionNumber: version.version_number,
      isProduction: version.is_production,
      original: plan.original,
      replayed: reply.content,
    });
  } catch (err) {
    return handleError(err);
  }
}

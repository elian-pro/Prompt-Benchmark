import { NextRequest, NextResponse } from "next/server";
import { getSession, appendMessage } from "@/lib/db/demo-sessions";
import { getRoleDefault } from "@/lib/db/role-defaults";
import { RoleNotConfiguredError } from "@/lib/db/runs";
import { appendDemoMessageSchema } from "@/lib/schemas/demo-sessions";
import { chat, type ChatMessage } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Sends the human's message and returns the client bot's reply in one round
 * trip. Not streamed: the bot's JSON envelope must be parsed whole before
 * anything is shown (same reasoning as the Adversarial run engine), so the
 * client just shows "Escribiendo…" while this request is in flight. Persists
 * both turns to `demo_messages`.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Conversación no encontrada.", 404);
    if (session.status !== "active") {
      return jsonError("Esta conversación ya no admite más mensajes.", 409);
    }

    const input = appendDemoMessageSchema.parse(await req.json());

    const role = await getRoleDefault("test_bot");
    if (!role) {
      throw new RoleNotConfiguredError(
        "No hay un modelo asignado al rol Bot de prueba. Configúralo en Configuración.",
      );
    }

    // The bot's own past turns keep their raw JSON as `assistant` content
    // (it needs to see its own output shape to keep emitting it); only the
    // display layer reduces it to a readable bubble.
    const history: ChatMessage[] = session.messages.map((m) => ({
      role: m.role === "bot" ? "assistant" : "user",
      content: m.content,
    }));
    const messages: ChatMessage[] = [...history, { role: "user", content: input.content }];

    const nextTurn = session.messages.length + 1;
    const humanMessage = await appendMessage(id, {
      turnNumber: nextTurn,
      round: session.current_round,
      role: "human",
      content: input.content,
      versionNumberSnapshot: session.version_number_snapshot,
    });

    const reply = await chat({
      providerId: role.provider_id,
      modelName: role.model_name,
      systemPrompt: session.prompt_snapshot,
      messages,
      temperature: role.temperature ?? undefined,
      topP: role.top_p ?? undefined,
      maxTokens: role.max_tokens ?? undefined,
    });

    const botMessage = await appendMessage(id, {
      turnNumber: nextTurn + 1,
      round: session.current_round,
      role: "bot",
      content: reply.content,
      versionNumberSnapshot: session.version_number_snapshot,
    });

    return NextResponse.json({ humanMessage, botMessage });
  } catch (err) {
    return handleError(err);
  }
}

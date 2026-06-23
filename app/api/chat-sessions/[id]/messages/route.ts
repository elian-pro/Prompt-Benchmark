import { NextRequest } from "next/server";
import {
  getSession,
  appendMessage,
  updateDraft,
} from "@/lib/db/chat-sessions";
import { getRoleDefault } from "@/lib/db/role-defaults";
import { appendMessageSchema } from "@/lib/schemas/chat-sessions";
import { buildEditorSystemPrompt, extractPromptFromReply } from "@/lib/prompts/editor-persona";
import { streamChat, type ChatMessage } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Sends a user message and streams Opus's reply (text/plain). On stream close,
 * persists the assistant message with token usage and, if the reply contained a
 * fenced prompt block, updates the session's working draft.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) return jsonError("Sesión no encontrada.", 404);
    if (session.status === "abandoned") {
      return jsonError("La sesión fue descartada y no admite más mensajes.", 409);
    }

    const input = appendMessageSchema.parse(await req.json());

    const role = await getRoleDefault("editor");
    if (!role) {
      return jsonError(
        "No hay un modelo asignado al rol Editor. Configúralo en Configuración.",
        400,
      );
    }

    // History before this turn, plus the new user message.
    const history: ChatMessage[] = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    await appendMessage(id, {
      role: "user",
      content: input.content,
      attachments: input.attachments ?? null,
    });

    const systemPrompt = buildEditorSystemPrompt(session.current_draft_content ?? "");
    const messages: ChatMessage[] = [...history, { role: "user", content: input.content }];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let fullText = "";
        let tokensIn = 0;
        let tokensOut = 0;
        try {
          for await (const chunk of streamChat({
            providerId: role.provider_id,
            modelName: role.model_name,
            systemPrompt,
            messages,
            temperature: role.temperature ?? undefined,
            topP: role.top_p ?? undefined,
            maxTokens: role.max_tokens ?? undefined,
          })) {
            if (chunk.type === "text") {
              fullText += chunk.text;
              controller.enqueue(encoder.encode(chunk.text));
            } else {
              tokensIn = chunk.tokensIn;
              tokensOut = chunk.tokensOut;
            }
          }

          // Persist the assistant turn and capture the new draft if present.
          await appendMessage(id, {
            role: "assistant",
            content: fullText,
            tokensIn,
            tokensOut,
          });
          const newDraft = extractPromptFromReply(fullText);
          if (newDraft) await updateDraft(id, newDraft);

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

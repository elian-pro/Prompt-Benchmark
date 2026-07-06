import { NextRequest } from "next/server";
import {
  getSession,
  appendMessage,
  updateDraft,
} from "@/lib/db/chat-sessions";
import { getRoleDefault } from "@/lib/db/role-defaults";
import { getPromptOverride } from "@/lib/db/prompt-overrides";
import { downloadUploadBytes } from "@/lib/db/uploads";
import { getVersion } from "@/lib/db/versions";
import { appendMessageSchema } from "@/lib/schemas/chat-sessions";
import type { Attachment } from "@/lib/db/chat-sessions";
import { buildEditorSystemPrompt, extractPromptFromReply } from "@/lib/prompts/editor-persona";
import { buildCreatorSystemPrompt } from "@/lib/prompts/creator-persona";
import { streamChat, type ChatMessage, type MessageAttachment } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Downloads each attachment from Storage and shapes it for the model: images
 * and PDFs as base64, text/markdown decoded inline. Only the current turn's
 * files are sent (historical attachments may have expired).
 */
async function loadAttachmentsForModel(
  attachments: Attachment[],
): Promise<MessageAttachment[]> {
  const out: MessageAttachment[] = [];
  for (const a of attachments) {
    const dl = await downloadUploadBytes(a.uploadId);
    if (!dl) continue;
    const mediaType = dl.upload.mime_type ?? a.mimeType ?? "";
    if (mediaType.startsWith("image/")) {
      out.push({ filename: dl.upload.filename, mediaType, kind: "image", data: dl.bytes.toString("base64") });
    } else if (mediaType === "application/pdf") {
      out.push({ filename: dl.upload.filename, mediaType, kind: "document", data: dl.bytes.toString("base64") });
    } else {
      out.push({
        filename: dl.upload.filename,
        mediaType: mediaType || "text/plain",
        kind: "text",
        data: dl.bytes.toString("utf-8"),
      });
    }
  }
  return out;
}

/**
 * Sends a user message and streams Opus's reply (text/plain). On stream close,
 * persists the assistant message with token usage and, if the reply contained a
 * fenced prompt block, updates the session's working draft.
 *
 * Editor and Creator share this endpoint, branching on `session.type`: the
 * Editor edits the seeded draft (role `editor`); the Creator builds a new
 * prompt from the architectural reference at `base_version_id` (role
 * `creator`). The draft-extraction step is identical — Creator questionnaire
 * turns produce no fenced block, so the draft stays null until construction.
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

    const isCreator = session.type === "creator";
    const role = await getRoleDefault(isCreator ? "creator" : "editor");
    if (!role) {
      return jsonError(
        isCreator
          ? "No hay un modelo asignado al rol Creator. Configúralo en Configuración."
          : "No hay un modelo asignado al rol Editor. Configúralo en Configuración.",
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

    // The persona may be overridden from Settings; absent → code default.
    const personaOverride = await getPromptOverride(isCreator ? "creator" : "editor");
    let systemPrompt: string;
    if (isCreator) {
      // The base version is the architectural reference (structure only).
      const reference = session.base_version_id
        ? await getVersion(session.base_version_id)
        : null;
      systemPrompt = buildCreatorSystemPrompt(reference?.content ?? "", personaOverride);
    } else {
      systemPrompt = buildEditorSystemPrompt(session.current_draft_content ?? "", personaOverride);
    }
    const modelAttachments = input.attachments?.length
      ? await loadAttachmentsForModel(input.attachments)
      : undefined;
    const messages: ChatMessage[] = [
      ...history,
      { role: "user", content: input.content, attachments: modelAttachments },
    ];

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

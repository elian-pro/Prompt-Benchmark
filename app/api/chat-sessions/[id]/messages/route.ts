import { NextRequest } from "next/server";
import {
  getSession,
  appendMessage,
  updateDraft,
} from "@/lib/db/chat-sessions";
import { getRoleDefault } from "@/lib/db/role-defaults";
import { getPromptOverride } from "@/lib/db/prompt-overrides";
import { downloadUploadBytes, AttachmentUnavailableError } from "@/lib/db/uploads";
import { getVersion, getLatestVersionNumber } from "@/lib/db/versions";
import { computeNextNumber, syncVersionMarkers } from "@/lib/version-utils";
import { appendMessageSchema } from "@/lib/schemas/chat-sessions";
import type { Attachment } from "@/lib/db/chat-sessions";
import {
  buildEditorSystemPrompt,
  extractPromptFromReply,
  hasUnclosedPromptBlock,
  replacePromptBlock,
} from "@/lib/prompts/editor-persona";
import { buildCreatorSystemPrompt } from "@/lib/prompts/creator-persona";
import { streamChat, type ChatMessage, type MessageAttachment } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Editor/Creator must echo the FULL prompt back on every turn (see the
 * persona's output contract), so their effective output budget needs to
 * cover the client's entire prompt, not just a short reply. The generic
 * adapter fallback (DEFAULT_MAX_TOKENS, 4096) was silently truncating real
 * production prompts mid-word — extractPromptFromReply then found no closing
 * fence, so the draft never updated. This role-specific default only applies
 * when the operator hasn't set an explicit "Máx tokens" in Configuración.
 */
const EDITOR_CREATOR_MAX_TOKENS = 32000;

/**
 * Downloads each attachment from Storage and shapes it for the model: images
 * and PDFs as base64, text/markdown decoded inline. Only the current turn's
 * files are sent (historical attachments may have expired).
 *
 * Throws AttachmentUnavailableError if a file can't be loaded (deleted,
 * expired, Storage failure) instead of silently sending the turn without it.
 * Otherwise the model truthfully reports it has no file while the user
 * believes they attached one.
 */
async function loadAttachmentsForModel(
  attachments: Attachment[],
): Promise<MessageAttachment[]> {
  const out: MessageAttachment[] = [];
  for (const a of attachments) {
    const dl = await downloadUploadBytes(a.uploadId);
    if (!dl) {
      throw new AttachmentUnavailableError(
        `No se pudo cargar el archivo adjunto "${a.filename}". Puede haber expirado o haber sido eliminado; vuelve a adjuntarlo e intenta de nuevo.`,
      );
    }
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
 * Sends a user message and streams Opus's reply as NDJSON events:
 *   {type:"text", text} — incremental content, same as the raw reply text.
 *   {type:"done", truncated, draftBroken} — sent once at the end.
 * On stream close, persists the assistant message with token usage and, if
 * the reply contained a closed fenced prompt block, updates the session's
 * working draft.
 *
 * `truncated` reports the provider stopped because it hit the max_tokens
 * ceiling (the reply may be an incomplete fragment) — this can happen even
 * when the draft extracted fine (e.g. the trailing "CAMBIOS REALIZADOS"
 * summary got cut). `draftBroken` specifically means a fenced block was
 * opened but never closed, so extraction failed and the draft was NOT
 * updated even though the model clearly intended to emit one — this is
 * never true for legitimate no-draft replies (e.g. a clarifying question),
 * only for the actually-cut-off case. The client surfaces both distinctly.
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
      // Structured options selection (UI-only): persisted so a reopened block
      // shows the exact choices. The model only sees input.content as history.
      answer: input.answer ?? null,
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
        let closed = false;
        const send = (evt: Record<string, unknown>) => {
          if (closed) return;
          controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));
        };

        // Flush a byte immediately, and keep flushing every 15s, so a reverse
        // proxy in front of the app doesn't 502 the connection while Opus is
        // still producing its first token (time-to-first-token can be several
        // seconds on a large prompt, and this route otherwise sends nothing
        // until then). The client ignores unknown event types, so pings are
        // harmless. Same resilience the adversarial run route gets for free
        // from its immediate turn_start.
        send({ type: "ping" });
        const heartbeat = setInterval(() => {
          try {
            send({ type: "ping" });
          } catch {
            // Stream already gone — nothing to keep alive.
          }
        }, 15000);
        const stopHeartbeat = () => {
          clearInterval(heartbeat);
        };

        let fullText = "";
        let tokensIn = 0;
        let tokensOut = 0;
        let truncated = false;
        try {
          for await (const chunk of streamChat({
            providerId: role.provider_id,
            modelName: role.model_name,
            systemPrompt,
            messages,
            temperature: role.temperature ?? undefined,
            topP: role.top_p ?? undefined,
            maxTokens: role.max_tokens ?? EDITOR_CREATOR_MAX_TOKENS,
          })) {
            if (chunk.type === "text") {
              fullText += chunk.text;
              send({ type: "text", text: chunk.text });
            } else {
              tokensIn = chunk.tokensIn;
              tokensOut = chunk.tokensOut;
              truncated = chunk.truncated;
            }
          }

          const draftBroken = hasUnclosedPromptBlock(fullText);
          let newDraft = draftBroken ? null : extractPromptFromReply(fullText);
          let contentToStore = fullText;
          // Editor: stamp the draft (and the stored message, so the chat card
          // matches) with the version it WILL become on finalize (the next
          // minor bump), so the user sees v1.8 while editing instead of the
          // base v1.7. This does not change the DB's latest version, so
          // finalize still computes the same number: no double bump.
          if (newDraft && !isCreator && session.client_id) {
            const latest = await getLatestVersionNumber(session.client_id);
            newDraft = syncVersionMarkers(newDraft, computeNextNumber(latest, "minor"));
            contentToStore = replacePromptBlock(fullText, newDraft);
          }

          // Persist the assistant turn (version-stamped) and update the draft.
          await appendMessage(id, {
            role: "assistant",
            content: contentToStore,
            tokensIn,
            tokensOut,
          });
          if (newDraft) await updateDraft(id, newDraft);

          send({ type: "done", truncated, draftBroken });
          stopHeartbeat();
          closed = true;
          controller.close();
        } catch (err) {
          stopHeartbeat();
          closed = true;
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Disable proxy buffering (nginx and friends) so bytes stream through
        // immediately instead of being held back until the response ends.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

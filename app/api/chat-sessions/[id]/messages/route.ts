import { NextRequest } from "next/server";
import {
  getSession,
  appendMessage,
  deleteMessage,
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
import {
  startTurn,
  stopTurn,
  getTurn,
  subscribeTurn,
  TurnInFlightError,
  type TurnEvent,
  type TurnJob,
} from "@/lib/jobs/chat-turn";
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
    out.push(toModelAttachment(dl, a));
  }
  return out;
}

/** Shapes one downloaded upload for the model. */
function toModelAttachment(
  dl: NonNullable<Awaited<ReturnType<typeof downloadUploadBytes>>>,
  a: Attachment,
): MessageAttachment {
  const mediaType = dl.upload.mime_type ?? a.mimeType ?? "";
  if (mediaType.startsWith("image/")) {
    return { filename: dl.upload.filename, mediaType, kind: "image", data: dl.bytes.toString("base64") };
  }
  if (mediaType === "application/pdf") {
    return { filename: dl.upload.filename, mediaType, kind: "document", data: dl.bytes.toString("base64") };
  }
  return {
    filename: dl.upload.filename,
    mediaType: mediaType || "text/plain",
    kind: "text",
    data: dl.bytes.toString("utf-8"),
  };
}

/**
 * Re-loads the files of an OLDER turn so a document stays visible for the rest
 * of the conversation instead of only the turn it arrived in.
 *
 * Best-effort on purpose: uploads expire after 7 days, and a file that is gone
 * must not make every later turn fail. What is missing is named in the text so
 * the model says "ya no tengo ese archivo" instead of inventing its contents.
 *
 * ponytail: re-downloads every historical file from Storage on every turn.
 * Fine for the handful of files a prompt session carries; add an in-request
 * memo or a bytes cache if a long session with many attachments feels slow.
 */
async function loadHistoricalAttachments(
  attachments: Attachment[],
): Promise<{ loaded: MessageAttachment[]; missing: string[] }> {
  const loaded: MessageAttachment[] = [];
  const missing: string[] = [];
  for (const a of attachments) {
    const dl = await downloadUploadBytes(a.uploadId).catch(() => null);
    if (dl) loaded.push(toModelAttachment(dl, a));
    else missing.push(a.filename);
  }
  return { loaded, missing };
}

/**
 * Attaches an HTTP response to a running turn: replays whatever the job has
 * already generated, then tails it live, as NDJSON. Shared by POST (which has
 * nothing to replay yet, so the replay is a no-op) and GET (which reattaches a
 * client that navigated away and came back).
 *
 * Losing this connection does NOT cancel anything. It only unsubscribes, which
 * is the entire point: the job outlives the request that started it.
 */
function turnStream(job: TurnJob): Response {
  const encoder = new TextEncoder();
  let teardown = () => {};

  const stream = new ReadableStream<Uint8Array>({
    // Synchronous on purpose: no await between reading the job's buffered text
    // and subscribing, so no delta can slip through the gap.
    start(controller) {
      let closed = false;
      let detach = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const close = () => {
        if (closed) return;
        closed = true;
        detach();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already torn down by the client going away.
        }
      };
      teardown = close;
      const send = (evt: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));
        } catch {
          close();
        }
      };

      // Flush a byte immediately, and keep flushing every 15s, so a reverse
      // proxy in front of the app doesn't 502 the connection while Opus is
      // still producing its first token (time-to-first-token can be several
      // seconds on a large prompt). The client ignores unknown event types, so
      // pings are harmless.
      send({ type: "ping" });
      heartbeat = setInterval(() => send({ type: "ping" }), 15000);

      detach = subscribeTurn(job, (evt: TurnEvent) => {
        send(evt);
        if (evt.type !== "text") close();
      });
      // subscribeTurn replays synchronously, so an already-finished job has
      // closed us by now and the heartbeat above is already cleared.
    },
    cancel() {
      // The client left. Unsubscribe and stop the heartbeat, but let the turn
      // itself keep running.
      teardown();
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
 * Backgrounding: generation does NOT live in this request. POST registers a job
 * (see lib/jobs/chat-turn.ts) and then subscribes to it, so a client that
 * navigates away only unsubscribes while the turn runs to completion and
 * persists itself. GET reattaches to a turn already in flight, replaying what
 * it has produced so far. Closing the connection means "I left", never "cancel".
 *
 * Cancellation is therefore explicit: DELETE aborts the job's own signal. The
 * loop breaks, which returns the provider generator and aborts the upstream
 * request so the rest of the reply is never generated. The whole turn is then
 * discarded, including the user message stored on the way in: a cancelled turn
 * is deliberately NOT salvaged the way a provider failure is, because the
 * operator stopped it on purpose.
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
    // Checked before the user message is stored, so a second tab (or a double
    // submit) can't strand an extra user row with no reply behind it.
    if (getTurn(id)) {
      return jsonError(
        "Ya hay una respuesta en curso en esta sesión. Espera a que termine.",
        409,
      );
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

    // History before this turn, plus the new user message. Past attachments are
    // re-sent, so a document the user shared on turn 2 is still readable on
    // turn 20 rather than surviving only as whatever the model said about it.
    const history: ChatMessage[] = await Promise.all(
      session.messages.map(async (m): Promise<ChatMessage> => {
        if (!m.attachments?.length) return { role: m.role, content: m.content };
        const { loaded, missing } = await loadHistoricalAttachments(m.attachments);
        return {
          role: m.role,
          content: missing.length
            ? `${m.content}\n\n[Archivos de este mensaje que ya no están disponibles: ${missing.join(", ")}]`
            : m.content,
          attachments: loaded.length ? loaded : undefined,
        };
      }),
    );
    const userMessage = await appendMessage(id, {
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

    // Persists the assistant turn and, when the reply carried a closed fenced
    // prompt block, updates the working draft. Shared by the normal completion
    // path and the mid-stream-failure salvage below, so a dropped connection
    // stores exactly what a clean finish would have. Returns whether a block
    // was opened but left unclosed (draftBroken).
    const persistTurn = async (
      text: string,
      tokensIn: number,
      tokensOut: number,
    ): Promise<{ draftBroken: boolean }> => {
      const draftBroken = hasUnclosedPromptBlock(text);
      let newDraft = draftBroken ? null : extractPromptFromReply(text);
      let contentToStore = text;
      // Editor: stamp the draft (and the stored message, so the chat card
      // matches) with the version it WILL become on finalize (the next minor
      // bump), so the user sees v1.8 while editing instead of the base v1.7.
      // This does not change the DB's latest version, so finalize still
      // computes the same number: no double bump.
      if (newDraft && !isCreator && session.client_id) {
        const latest = await getLatestVersionNumber(session.client_id);
        newDraft = syncVersionMarkers(newDraft, computeNextNumber(latest, "minor"));
        contentToStore = replacePromptBlock(text, newDraft);
      }
      await appendMessage(id, {
        role: "assistant",
        content: contentToStore,
        tokensIn,
        tokensOut,
      });
      if (newDraft) await updateDraft(id, newDraft);
      return { draftBroken };
    };

    // The operator pressed "detener": undo the user turn stored above so the
    // cancelled exchange leaves no trace, and skip the partial-reply salvage.
    // Best-effort, a failed delete must not mask the cancellation itself.
    const discardTurn = async () => {
      try {
        await deleteMessage(userMessage.id);
      } catch (delErr) {
        console.error(
          `[chat-sessions] failed to delete cancelled user message (session ${id}): ${
            delErr instanceof Error ? (delErr.stack ?? delErr.message) : String(delErr)
          }`,
        );
      }
    };

    // The turn itself, handed to the registry and run detached from this
    // request. Everything domain-specific stays here (draft extraction,
    // version stamping, token accounting, the partial-reply salvage); the
    // registry only buffers text and fans it out to whoever is attached.
    const run = async (
      signal: AbortSignal,
      emit: (text: string) => void,
    ): Promise<TurnEvent> => {
      let fullText = "";
      let tokensIn = 0;
      let tokensOut = 0;
      let truncated = false;
      // Guards the salvage path from re-persisting: a provider error landing
      // right after a clean persist would otherwise store the turn twice.
      let persisted = false;
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
          // Cancelled from the stop button, which now goes through DELETE.
          // Breaking here returns the provider generator, which aborts the
          // upstream request, so the rest of the reply is never generated (and
          // never billed). The already-consumed input tokens are spent either
          // way.
          if (signal.aborted) break;
          if (chunk.type === "text") {
            fullText += chunk.text;
            emit(chunk.text);
          } else {
            tokensIn = chunk.tokensIn;
            tokensOut = chunk.tokensOut;
            truncated = chunk.truncated;
          }
        }

        if (signal.aborted) {
          await discardTurn();
          return { type: "cancelled" };
        }

        // Persist the assistant turn (version-stamped) and update the draft.
        const { draftBroken } = await persistTurn(fullText, tokensIn, tokensOut);
        persisted = true;
        return { type: "done", truncated, draftBroken };
      } catch (err) {
        // Same cancellation, but it surfaced as a throw before the loop could
        // check the signal. Discard, don't log, and above all don't salvage:
        // the user stopped this turn precisely because they don't want it.
        if (signal.aborted) {
          await discardTurn();
          return { type: "cancelled" };
        }
        // The provider stream broke mid-flight. A client walking away is no
        // longer one of the possible causes, so this is always a real upstream
        // failure and always worth a log line.
        console.error(
          `[chat-sessions] stream failed (session ${id}, type ${session.type}): ${
            err instanceof Error ? (err.stack ?? err.message) : String(err)
          }`,
        );
        // Salvage whatever was generated so a mid-flight failure doesn't
        // discard the turn: the user finds the partial reply (and its draft, if
        // a full block already arrived) on the next re-sync instead of an empty
        // chat. Token counts are best-effort: tokensOut only arrives on the
        // provider's final event, so a mid-stream break leaves it 0.
        if (fullText && !persisted) {
          try {
            await persistTurn(fullText, tokensIn, tokensOut);
          } catch (persistErr) {
            console.error(
              `[chat-sessions] failed to persist partial reply (session ${id}): ${
                persistErr instanceof Error
                  ? (persistErr.stack ?? persistErr.message)
                  : String(persistErr)
              }`,
            );
          }
        }
        return {
          type: "error",
          message: err instanceof Error ? err.message : "La generación falló.",
        };
      }
    };

    const job = startTurn({
      sessionId: id,
      mode: session.type,
      title: session.client_name ?? session.title ?? "Sesión",
      run,
    });
    return turnStream(job);
  } catch (err) {
    // Two POSTs that both cleared the getTurn guard above and then raced
    // through the awaits between it and startTurn. The loser reports the same
    // conflict the guard would have.
    if (err instanceof TurnInFlightError) return jsonError(err.message, 409);
    return handleError(err);
  }
}

/**
 * Reattaches to a turn already generating for this session, replaying what it
 * has produced so far and then tailing it live. 204 when nothing is in flight,
 * which is the client's cue to just read the finished conversation from the
 * database: the assistant message is always persisted before a job leaves the
 * registry, so there is no window where a reply is both missing and unreadable.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const job = getTurn(id);
    if (!job) return new Response(null, { status: 204 });
    return turnStream(job);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * The composer's stop button. Closing the stream no longer cancels anything, so
 * stopping has to be said out loud. Idempotent: a stop that lands after the
 * last token is a no-op, not an error, because the button always races the end
 * of the turn.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    stopTurn(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}

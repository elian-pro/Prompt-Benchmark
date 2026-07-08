import { NextRequest } from "next/server";
import {
  getRun,
  appendRunMessage,
  saveReport,
  updateRunStatus,
  type RunMessageRole,
} from "@/lib/db/runs";
import { buildLeadSystemPrompt } from "@/lib/prompts/adversarial-personas";
import { buildJudgeSystemPrompt, judgeReportSchema } from "@/lib/prompts/judge";
import { getPromptOverride } from "@/lib/db/prompt-overrides";
import { parseTurn, stripStageDirection } from "@/lib/adversarial-message";
import { chat, type ChatMessage } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
// The conversation can take a while; allow a generous server-side budget.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

// Priming user message for whoever starts: their own messages map to the
// "assistant" role, which can't lead an Anthropic message list, so the starter
// always gets a synthetic opening user turn (never persisted as a run message).
// Framed as a real customer entering the chat so the bot engages instead of
// defaulting to a human handoff.
const SEED_BOT =
  "Hola, buenas. Vi su información y me interesa saber más sobre lo que ofrecen. ¿Me pueden ayudar?";
const SEED_LEAD =
  "(Acabas de entrar al chat del negocio como cliente. Escribe tu primer mensaje para iniciar la conversación, en el papel que se te indicó.)";

// Shown to the lead when the bot turn carried no readable message (e.g. it
// returned {"estado":"humano","mensajes":[]}), so the adversary reacts to the
// silence instead of talking into a JSON void.
const NO_BOT_REPLY =
  "(El agente no envió ningún mensaje: derivó la conversación a un humano.)";

// Pacing so the transcript is watchable. Each turn is generated in full
// server-side (no partial content is ever sent to the client — that's what let
// a bot's raw JSON or a lead's leaked stage direction flash on screen before
// being replaced). The client only sees turn_start ("Escribiendo…") and
// turn_end with the final, already-clean text. The artificial pause between
// the two scales with message length so longer replies still read as typed.
const MIN_TYPING_MS = 500;
const MAX_TYPING_MS = 3500;
const MS_PER_WORD = 45;
const TURN_GAP_MS = 1000; // pause between one turn and the next
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function typingDelayFor(text: string): number {
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.min(MAX_TYPING_MS, Math.max(MIN_TYPING_MS, wordCount * MS_PER_WORD));
}

type Transcript = { role: RunMessageRole; content: string }[];

/** The bot's turn as the lead should see it: its real message, not the JSON. */
function botMessageForLead(content: string): string {
  const { message } = parseTurn(content);
  return message.trim() ? message : NO_BOT_REPLY;
}

/**
 * Builds the message list from one participant's point of view: the other
 * party's turns are `user`, its own are `assistant`. The starter's own turns
 * come first in the transcript, so a seed user message is prepended to keep the
 * list starting with `user`. When the counterpart is the bot, its structured
 * JSON is reduced to the readable message so the lead responds to real text.
 */
function perspective(
  transcript: Transcript,
  current: RunMessageRole,
  seed: string,
): ChatMessage[] {
  const messages: ChatMessage[] = transcript.map((m) => {
    const isOwn = m.role === current;
    const content = !isOwn && m.role === "bot" ? botMessageForLead(m.content) : m.content;
    return { role: isOwn ? "assistant" : "user", content };
  });
  if (messages.length === 0 || messages[0].role === "assistant") {
    messages.unshift({ role: "user", content: seed });
  }
  return messages;
}

/** Renders the transcript as a labeled text block for the judge to analyze. */
function formatTranscript(transcript: Transcript): string {
  return transcript
    .map((m, i) => {
      const who = m.role === "bot" ? "AGENTE (bot bajo prueba)" : "LEAD (adversario)";
      return `[Turno ${i + 1}] ${who}:\n${m.content}`;
    })
    .join("\n\n");
}

/** Parses the judge's JSON, tolerating an accidental ```json fence wrapper. */
function parseJudgeReply(reply: string): unknown {
  const trimmed = reply.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("El juez no devolvió un JSON válido.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Orchestrates the bot↔lead conversation for a run and streams it turn by turn
 * as NDJSON events. Each event is a JSON object on its own line:
 *   {type:'turn_start', turn, role} ·
 *   {type:'turn_end', turn, role, content} · {type:'judging'} ·
 *   {type:'report', report} · {type:'status', status} · {type:'error', message}
 * A turn's text is generated in full server-side and never streamed
 * partially — the client only learns a turn is in progress (turn_start) and
 * then gets the final, already-clean content (turn_end). Each turn is
 * persisted to `run_messages`. When the conversation ends the judge analyzes
 * the transcript, its validated report is saved to `reports`, and the run
 * status moves running → completed (or error if anything throws).
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const run = await getRun(id);
    if (!run) return jsonError("Prueba no encontrada.", 404);
    if (run.status !== "pending") {
      return jsonError("La prueba ya fue ejecutada o está en curso.", 409);
    }

    const leadPrompt = buildLeadSystemPrompt(run.preset, run.intensity);
    // The judge persona may be overridden from Settings; absent → code default.
    const judgeOverride = await getPromptOverride("judge");
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (evt: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));

        const transcript: Transcript = [];
        let current: RunMessageRole = run.starter;

        try {
          await updateRunStatus(id, "running");

          for (let turn = 1; turn <= run.max_turns; turn++) {
            const isBot = current === "bot";
            const config = isBot ? run.bot_config : run.lead_config;
            const systemPrompt = isBot ? run.prompt_snapshot : leadPrompt;
            const seed = isBot ? SEED_BOT : SEED_LEAD;
            const messages = perspective(transcript, current, seed);

            send({ type: "turn_start", turn, role: current });

            const reply = await chat({
              providerId: config.provider_id,
              modelName: config.model_name,
              systemPrompt,
              messages,
              temperature: config.temperature ?? undefined,
              topP: config.top_p ?? undefined,
              maxTokens: config.max_tokens ?? undefined,
            });
            // The lead occasionally narrates a stage direction despite being
            // told not to (e.g. "(espero la respuesta, escribo algo
            // casual)\n\n...") — strip it before it's ever shown, persisted, or
            // fed back into either participant's context.
            const text = isBot ? reply.content : stripStageDirection(reply.content);

            // Hold on the "Escribiendo…" indicator a bit, scaled to length, so
            // the turn reads as typed rather than appearing instantly.
            await sleep(typingDelayFor(text));

            await appendRunMessage(id, { turnNumber: turn, role: current, content: text });
            transcript.push({ role: current, content: text });
            send({ type: "turn_end", turn, role: current, content: text });

            current = isBot ? "lead" : "bot";

            // Breathing room before the next turn so it's easy to follow.
            if (turn < run.max_turns) await sleep(TURN_GAP_MS);
          }

          // Conversation done — judge the full transcript (non-streaming).
          send({ type: "judging" });
          const judgeReply = await chat({
            providerId: run.judge_config.provider_id,
            modelName: run.judge_config.model_name,
            systemPrompt: buildJudgeSystemPrompt(judgeOverride),
            messages: [{ role: "user", content: formatTranscript(transcript) }],
            temperature: run.judge_config.temperature ?? undefined,
            topP: run.judge_config.top_p ?? undefined,
            maxTokens: run.judge_config.max_tokens ?? undefined,
          });
          const report = judgeReportSchema.parse(parseJudgeReply(judgeReply.content));
          const saved = await saveReport(id, report);
          send({ type: "report", report: saved });

          await updateRunStatus(id, "completed");
          send({ type: "status", status: "completed" });
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Error al ejecutar la prueba.";
          await updateRunStatus(id, "error", message).catch(() => {});
          send({ type: "error", message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

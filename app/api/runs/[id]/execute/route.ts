import { NextRequest } from "next/server";
import {
  getRun,
  appendRunMessage,
  updateRunStatus,
  type RunMessageRole,
} from "@/lib/db/runs";
import { buildLeadSystemPrompt } from "@/lib/prompts/adversarial-personas";
import { streamChat, type ChatMessage } from "@/lib/providers";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
// The conversation can take a while; allow a generous server-side budget.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

// Priming user message for whoever starts: their own messages map to the
// "assistant" role, which can't lead an Anthropic message list, so the starter
// always gets a synthetic opening user turn (never persisted as a run message).
const SEED_BOT = "(Inicia la conversación: saluda al prospecto y comienza a perfilarlo.)";
const SEED_LEAD = "(Inicia el chat enviando tu primer mensaje al agente.)";

type Transcript = { role: RunMessageRole; content: string }[];

/**
 * Builds the message list from one participant's point of view: the other
 * party's turns are `user`, its own are `assistant`. The starter's own turns
 * come first in the transcript, so a seed user message is prepended to keep the
 * list starting with `user`.
 */
function perspective(
  transcript: Transcript,
  current: RunMessageRole,
  seed: string,
): ChatMessage[] {
  const messages: ChatMessage[] = transcript.map((m) => ({
    role: m.role === current ? "assistant" : "user",
    content: m.content,
  }));
  if (messages.length === 0 || messages[0].role === "assistant") {
    messages.unshift({ role: "user", content: seed });
  }
  return messages;
}

/**
 * Orchestrates the bot↔lead conversation for a run and streams it turn by turn
 * as NDJSON events. Each event is a JSON object on its own line:
 *   {type:'turn_start', turn, role} · {type:'delta', text} ·
 *   {type:'turn_end', turn, role} · {type:'status', status} ·
 *   {type:'error', message}
 * Each turn is persisted to `run_messages`; the run status moves
 * running → completed (or error). The judge call lands in S4-T5.
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

            let text = "";
            for await (const chunk of streamChat({
              providerId: config.provider_id,
              modelName: config.model_name,
              systemPrompt,
              messages,
              temperature: config.temperature ?? undefined,
              topP: config.top_p ?? undefined,
              maxTokens: config.max_tokens ?? undefined,
            })) {
              if (chunk.type === "text") {
                text += chunk.text;
                send({ type: "delta", text: chunk.text });
              }
            }

            await appendRunMessage(id, { turnNumber: turn, role: current, content: text });
            transcript.push({ role: current, content: text });
            send({ type: "turn_end", turn, role: current });

            current = isBot ? "lead" : "bot";
          }

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

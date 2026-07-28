/** Anthropic native adapter using @anthropic-ai/sdk. */
import Anthropic from "@anthropic-ai/sdk";
import {
  type ChatRequest,
  type ChatResponse,
  type AdapterContext,
  type StreamChunk,
  type ChatMessage,
  DEFAULT_MAX_TOKENS,
} from "./types";

function client(ctx: AdapterContext): Anthropic {
  return new Anthropic({ apiKey: ctx.apiKey });
}

/**
 * Renders a message into Anthropic's format. With no attachments the content
 * is a plain string; otherwise it becomes a content-block array: the text,
 * then native image/document blocks, with text files folded inline.
 */
function toMessageParam(m: ChatMessage, cache = false): Anthropic.MessageParam {
  if ((!m.attachments || m.attachments.length === 0) && !cache) {
    return { role: m.role, content: m.content };
  }
  // Narrower than ContentBlockParam: every block we build accepts
  // cache_control, which the full union (ThinkingBlockParam) does not.
  const blocks: (
    | Anthropic.TextBlockParam
    | Anthropic.ImageBlockParam
    | Anthropic.DocumentBlockParam
  )[] = [];
  let text = m.content;
  for (const a of m.attachments ?? []) {
    if (a.kind === "image") {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: a.mediaType as never, data: a.data },
      });
    } else if (a.kind === "document") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: a.data },
      });
    } else {
      text += `\n\n--- Archivo adjunto: ${a.filename} ---\n${a.data}`;
    }
  }
  const content: typeof blocks = [{ type: "text", text }, ...blocks];
  if (cache) {
    // Breakpoint on the last block of the newest turn: this request writes it,
    // the next one finds it inside its own prefix and reads it back.
    content[content.length - 1].cache_control = { type: "ephemeral" };
  }
  return { role: m.role, content };
}

function baseParams(req: ChatRequest) {
  const lastIndex = req.messages.length - 1;
  return {
    model: req.modelName,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    // Rendering order is system then messages, so the system breakpoint covers
    // the whole stable prefix and the message one extends it turn by turn.
    system:
      req.cache && req.systemPrompt
        ? [
            {
              type: "text" as const,
              text: req.systemPrompt,
              cache_control: { type: "ephemeral" as const },
            },
          ]
        : req.systemPrompt,
    messages: req.messages.map((m, i) => toMessageParam(m, req.cache === true && i === lastIndex)),
    temperature: req.temperature,
    top_p: req.topP,
  };
}

export async function chat(req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
  const res = await client(ctx).messages.create({ ...baseParams(req), stream: false });
  const content = res.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return {
    content,
    tokensIn: res.usage.input_tokens,
    tokensOut: res.usage.output_tokens,
    truncated: res.stop_reason === "max_tokens",
  };
}

export async function* streamChat(
  req: ChatRequest,
  ctx: AdapterContext,
): AsyncIterable<StreamChunk> {
  const stream = await client(ctx).messages.create({ ...baseParams(req), stream: true });
  let tokensIn = 0;
  let tokensOut = 0;
  let stopReason: string | null = null;
  for await (const event of stream) {
    if (event.type === "message_start") {
      tokensIn = event.message.usage.input_tokens;
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    } else if (event.type === "message_delta") {
      // output_tokens on message_delta is the cumulative final count.
      tokensOut = event.usage.output_tokens;
      stopReason = event.delta.stop_reason;
    }
  }
  yield { type: "usage", tokensIn, tokensOut, truncated: stopReason === "max_tokens" };
}

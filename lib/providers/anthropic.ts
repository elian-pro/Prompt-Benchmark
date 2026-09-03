/** Anthropic native adapter using @anthropic-ai/sdk. */
import Anthropic from "@anthropic-ai/sdk";
import {
  type ChatRequest,
  type ChatResponse,
  type AdapterContext,
  type StreamChunk,
  type ChatMessage,
  DEFAULT_MAX_TOKENS,
} from "./types.ts";

function client(ctx: AdapterContext): Anthropic {
  return new Anthropic({ apiKey: ctx.apiKey });
}

/**
 * Renders a message into Anthropic's format. With no attachments outside a
 * caching request, the content is a plain string; otherwise it becomes a
 * content-block array: the text, then native image/document blocks, with
 * text files folded inline.
 *
 * `cacheable` (whether the whole request is caching, not whether THIS
 * message holds the breakpoint) must decide the block-vs-string shape.
 * Every turn re-sends this session's prior messages, and each one holds the
 * breakpoint on exactly one turn before becoming plain history on the next.
 * If its shape flipped between those two turns (block array while it was the
 * breakpoint, bare string once it wasn't), the prefix Anthropic cached would
 * no longer match byte-for-byte and every later turn would miss the cache
 * instead of extending it.
 */
function toMessageParam(m: ChatMessage, breakpoint: boolean, cacheable: boolean): Anthropic.MessageParam {
  if ((!m.attachments || m.attachments.length === 0) && !cacheable) {
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
  if (breakpoint) {
    // Breakpoint on the last block of the newest turn: this request writes it,
    // the next one finds it inside its own prefix and reads it back.
    content[content.length - 1].cache_control = { type: "ephemeral" };
  }
  return { role: m.role, content };
}

export function baseParams(req: ChatRequest) {
  // The breakpoint goes on the last message that will still look byte-identical
  // next turn. Volatile ones (a redrafted prompt) trail after it, so rewriting
  // them costs their own tokens instead of the whole conversation's.
  const cacheIndex = req.cache
    ? req.messages.reduce((last, m, i) => (m.volatile ? last : i), -1)
    : -1;
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
    messages: req.messages.map((m, i) => toMessageParam(m, i === cacheIndex, !!req.cache)),
    temperature: req.temperature,
    top_p: req.topP,
    // Reasoning depth. Left out entirely when unset so older models that
    // predate output_config never see the field.
    ...(req.effort ? { output_config: { effort: req.effort } } : {}),
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
    // input_tokens EXCLUDES cached traffic; report it so callers can see the
    // real prompt size and the cache hit rate.
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
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
  let cacheRead = 0;
  let cacheWrite = 0;
  let stopReason: string | null = null;
  for await (const event of stream) {
    if (event.type === "message_start") {
      tokensIn = event.message.usage.input_tokens;
      cacheRead = event.message.usage.cache_read_input_tokens ?? 0;
      cacheWrite = event.message.usage.cache_creation_input_tokens ?? 0;
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    } else if (event.type === "message_delta") {
      // output_tokens on message_delta is the cumulative final count.
      tokensOut = event.usage.output_tokens;
      stopReason = event.delta.stop_reason;
    }
  }
  yield {
    type: "usage",
    tokensIn,
    tokensOut,
    cacheRead,
    cacheWrite,
    truncated: stopReason === "max_tokens",
  };
}

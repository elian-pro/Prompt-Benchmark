/** Anthropic native adapter using @anthropic-ai/sdk. */
import Anthropic from "@anthropic-ai/sdk";
import {
  type ChatRequest,
  type ChatResponse,
  type AdapterContext,
  type StreamChunk,
  DEFAULT_MAX_TOKENS,
} from "./types";

function client(ctx: AdapterContext): Anthropic {
  return new Anthropic({ apiKey: ctx.apiKey });
}

function baseParams(req: ChatRequest) {
  return {
    model: req.modelName,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: req.systemPrompt,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
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
  };
}

export async function* streamChat(
  req: ChatRequest,
  ctx: AdapterContext,
): AsyncIterable<StreamChunk> {
  const stream = await client(ctx).messages.create({ ...baseParams(req), stream: true });
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const event of stream) {
    if (event.type === "message_start") {
      tokensIn = event.message.usage.input_tokens;
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    } else if (event.type === "message_delta") {
      // output_tokens on message_delta is the cumulative final count.
      tokensOut = event.usage.output_tokens;
    }
  }
  yield { type: "usage", tokensIn, tokensOut };
}

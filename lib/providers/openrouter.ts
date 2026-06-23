/** OpenRouter adapter — openai-compat with OpenRouter's base URL hardcoded. */
import * as openaiCompat from "./openai-compat";
import type { ChatRequest, ChatResponse, AdapterContext, StreamChunk } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function withBaseUrl(ctx: AdapterContext): AdapterContext {
  return { ...ctx, baseUrl: OPENROUTER_BASE_URL };
}

export function chat(req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
  return openaiCompat.chat(req, withBaseUrl(ctx));
}

export async function* streamChat(
  req: ChatRequest,
  ctx: AdapterContext,
): AsyncIterable<StreamChunk> {
  yield* openaiCompat.streamChat(req, withBaseUrl(ctx));
}

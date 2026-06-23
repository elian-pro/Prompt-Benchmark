/**
 * Unified LLM interface. Every LLM call in the app goes through here.
 *
 * chat() / streamChat() look up the provider, decrypt its API key (per call —
 * the plain key is never cached beyond request scope), pick the adapter by
 * adapter_type and dispatch.
 */
import { getProvider, getDecryptedKey } from "../db/providers";
import type { AdapterType } from "../db/providers";
import type { Adapter, AdapterContext, ChatRequest, ChatResponse } from "./types";
import * as openaiCompat from "./openai-compat";
import * as anthropic from "./anthropic";
import * as google from "./google";
import * as openrouter from "./openrouter";

export type { ChatRequest, ChatResponse, ChatMessage } from "./types";

const adapters: Record<AdapterType, Adapter> = {
  openai_compat: openaiCompat,
  anthropic,
  google,
  openrouter,
};

async function resolve(providerId: string): Promise<{ adapter: Adapter; ctx: AdapterContext }> {
  const provider = await getProvider(providerId);
  if (!provider) throw new Error("Proveedor no encontrado.");
  if (!provider.enabled) {
    throw new Error(`El proveedor "${provider.name}" está deshabilitado.`);
  }
  // Decrypt on every call; do not cache the plain key in memory.
  const apiKey = await getDecryptedKey(providerId);
  return {
    adapter: adapters[provider.adapter_type],
    ctx: { apiKey, baseUrl: provider.base_url },
  };
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const { adapter, ctx } = await resolve(req.providerId);
  return adapter.chat(req, ctx);
}

export async function* streamChat(req: ChatRequest): AsyncIterable<string> {
  const { adapter, ctx } = await resolve(req.providerId);
  yield* adapter.streamChat(req, ctx);
}

/**
 * Unified LLM interface. Every LLM call in the app goes through here.
 *
 * chat() / streamChat() look up the provider, decrypt its API key (per call —
 * the plain key is never cached beyond request scope), pick the adapter by
 * adapter_type and dispatch.
 */
import { getProvider, getDecryptedKey } from "../db/providers";
import type { AdapterType } from "../db/providers";
import type { Adapter, AdapterContext, ChatRequest, ChatResponse, StreamChunk } from "./types";
import * as openaiCompat from "./openai-compat";
import * as anthropic from "./anthropic";
import * as google from "./google";
import * as openrouter from "./openrouter";

export type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  StreamChunk,
  MessageAttachment,
  ToolDef,
  ToolParam,
  ToolCall,
} from "./types";

const adapters: Record<AdapterType, Adapter> = {
  openai_compat: openaiCompat,
  anthropic,
  google,
  openrouter,
};

/** Adapters that can pass tools to the model (openrouter delegates to
 *  openai-compat, so it gets them for free). */
const TOOL_CAPABLE: AdapterType[] = ["openai_compat", "openrouter"];

async function resolve(
  providerId: string,
): Promise<{ adapter: Adapter; ctx: AdapterContext; type: AdapterType; name: string }> {
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
    type: provider.adapter_type,
    name: provider.name,
  };
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const { adapter, ctx, type, name } = await resolve(req.providerId);
  // Fail loudly instead of dropping the tools: a bot that silently stops
  // consulting the catalog looks like a prompt problem, not a config one.
  if (req.tools?.length && !TOOL_CAPABLE.includes(type)) {
    throw new Error(
      `El proveedor "${name}" no admite herramientas. Asigna uno de OpenAI al rol Bot de prueba en Configuración.`,
    );
  }
  return adapter.chat(req, ctx);
}

export async function* streamChat(req: ChatRequest): AsyncIterable<StreamChunk> {
  const { adapter, ctx } = await resolve(req.providerId);
  yield* adapter.streamChat(req, ctx);
}

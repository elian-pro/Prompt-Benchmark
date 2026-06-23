/** Shared types for the unified provider interface (see docs/ARCHITECTURE.md). */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatRequest = {
  providerId: string;
  modelName: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

export type ChatResponse = {
  content: string;
  tokensIn: number;
  tokensOut: number;
};

/** Per-request context an adapter needs: the decrypted key and optional base URL. */
export type AdapterContext = {
  apiKey: string;
  baseUrl?: string | null;
};

export type Adapter = {
  chat(req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse>;
  streamChat(req: ChatRequest, ctx: AdapterContext): AsyncIterable<string>;
};

/** Anthropic requires max_tokens; used as a fallback when the caller omits it. */
export const DEFAULT_MAX_TOKENS = 4096;

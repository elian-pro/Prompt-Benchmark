/** Shared types for the unified provider interface (see docs/ARCHITECTURE.md). */

/**
 * A file attached to a message. `data` is base64-encoded bytes for binary
 * kinds (image/document) and decoded UTF-8 text for the text kind. Adapters
 * that don't support a kind may ignore it (only the Anthropic adapter renders
 * attachments today, since the editor role runs on Opus).
 */
export type MessageAttachment = {
  filename: string;
  mediaType: string;
  kind: "image" | "document" | "text";
  data: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: MessageAttachment[];
};

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

/**
 * A streamed response is a sequence of text deltas followed by exactly one
 * final `usage` chunk carrying the token counts (so callers get the same
 * tokensIn/tokensOut that chat() returns). Adapters that can't report usage
 * still emit a usage chunk with zeros.
 */
export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; tokensIn: number; tokensOut: number };

/** Per-request context an adapter needs: the decrypted key and optional base URL. */
export type AdapterContext = {
  apiKey: string;
  baseUrl?: string | null;
};

export type Adapter = {
  chat(req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse>;
  streamChat(req: ChatRequest, ctx: AdapterContext): AsyncIterable<StreamChunk>;
};

/** Anthropic requires max_tokens; used as a fallback when the caller omits it. */
export const DEFAULT_MAX_TOKENS = 4096;

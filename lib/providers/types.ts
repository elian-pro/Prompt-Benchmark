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

/** One argument the model fills in when it calls a tool (n8n's `$fromAI`). */
export type ToolParam = {
  name: string;
  description: string;
  type: "string" | "number" | "boolean";
  /** Defaults to required (absent means true). An optional one is left out of
   *  the schema's `required` list, so the model can omit it and the endpoint
   *  falls back to its own default instead of filtering on an empty value. */
  required?: boolean;
};

/**
 * A tool offered to the model. `description` is what makes it call the tool or
 * ignore it, so it is as much part of the prompt as the system prompt is.
 */
export type ToolDef = {
  name: string;
  description: string;
  params: ToolParam[];
};

/** A tool the model asked for. `args` is its raw JSON, unparsed and untrusted. */
export type ToolCall = {
  id: string;
  name: string;
  args: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Tools this assistant turn asked for. Round-tripped back to the provider so
   *  the results can be matched to their calls. */
  toolCalls?: ToolCall[];
  /** This message carries tool results instead of text: adapters render it as
   *  the provider's tool role and ignore `content`. */
  toolResults?: { id: string; content: string }[];
  attachments?: MessageAttachment[];
  /**
   * This message is rebuilt on every turn (the Editor's working draft), so it
   * must stay OUTSIDE the cached prefix. Adapters put the cache breakpoint on
   * the last non-volatile message; volatile ones trail after it. Requires the
   * caller to keep them last, and to not persist them as history.
   */
  volatile?: boolean;
};

export type ChatRequest = {
  providerId: string;
  modelName: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /**
   * Marks the system prompt and the conversation so far as cacheable, so a
   * long history (and any attached documents in it) bills at ~10% on later
   * turns instead of full price.
   *
   * Only set this when the system prompt is STABLE across the session's turns.
   * Caching is a prefix match: a system prompt that changes every turn
   * invalidates the whole prefix, and the cache writes become pure overhead
   * (~1.25x) that is never read back. Ignored by adapters other than Anthropic.
   */
  cache?: boolean;
  /** Tools the model may call. Only the openai_compat adapter (and openrouter,
   *  which delegates to it) supports these; `chat()` rejects the rest rather
   *  than silently dropping them. */
  tools?: ToolDef[];
};

export type ChatResponse = {
  content: string;
  /** Present when the model stopped to call tools instead of answering. The
   *  caller runs them and asks again (see lib/client-tools.ts). */
  toolCalls?: ToolCall[];
  tokensIn: number;
  tokensOut: number;
  /** True when the provider stopped because it hit the max_tokens ceiling,
   *  not because the reply was actually finished — the content is a cut-off
   *  fragment. Adapters that can't report this default to false. */
  truncated: boolean;
};

/**
 * A streamed response is a sequence of text deltas followed by exactly one
 * final `usage` chunk carrying the token counts (so callers get the same
 * tokensIn/tokensOut/truncated that chat() returns). Adapters that can't
 * report usage or truncation still emit a usage chunk with zeros/false.
 */
export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; tokensIn: number; tokensOut: number; truncated: boolean };

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

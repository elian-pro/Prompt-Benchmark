/** Google Gemini native adapter using @google/genai (the current unified SDK). */
import { GoogleGenAI } from "@google/genai";
import type { ChatRequest, ChatResponse, AdapterContext, ChatMessage, StreamChunk } from "./types";

function client(ctx: AdapterContext): GoogleGenAI {
  return new GoogleGenAI({ apiKey: ctx.apiKey });
}

// Gemini uses role "model" for assistant turns.
function toContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function buildParams(req: ChatRequest) {
  return {
    model: req.modelName,
    contents: toContents(req.messages),
    config: {
      systemInstruction: req.systemPrompt,
      temperature: req.temperature,
      topP: req.topP,
      maxOutputTokens: req.maxTokens,
    },
  };
}

export async function chat(req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
  const res = await client(ctx).models.generateContent(buildParams(req));
  return {
    content: res.text ?? "",
    tokensIn: res.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: res.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function* streamChat(
  req: ChatRequest,
  ctx: AdapterContext,
): AsyncIterable<StreamChunk> {
  const stream = await client(ctx).models.generateContentStream(buildParams(req));
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const chunk of stream) {
    if (chunk.text) yield { type: "text", text: chunk.text };
    // usageMetadata accumulates; the last chunk carries the final totals.
    if (chunk.usageMetadata) {
      tokensIn = chunk.usageMetadata.promptTokenCount ?? tokensIn;
      tokensOut = chunk.usageMetadata.candidatesTokenCount ?? tokensOut;
    }
  }
  yield { type: "usage", tokensIn, tokensOut };
}

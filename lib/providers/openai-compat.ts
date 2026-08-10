/**
 * Adapter for OpenAI-compatible chat APIs (OpenAI, DeepSeek, Groq, Together,
 * Mistral, etc.). Plain `fetch` against `{base_url}/chat/completions`.
 */
import type {
  ChatRequest,
  ChatResponse,
  AdapterContext,
  StreamChunk,
  ToolCall,
  ToolDef,
} from "./types";

type OpenAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export function buildMessages(req: ChatRequest): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
  for (const m of req.messages) {
    // A results message is not a turn of its own: it expands into one `tool`
    // message per call, which is how the API matches results to calls.
    if (m.toolResults?.length) {
      for (const r of m.toolResults) {
        messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
    } else if (m.role === "assistant" && m.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.args },
        })),
      });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }
  return messages;
}

/** A tool definition in the shape the API expects: JSON Schema per argument. */
export function toOpenAiFunction(tool: ToolDef) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const p of tool.params) {
    properties[p.name] = { type: p.type, description: p.description };
  }
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        // Optional ones are left out so the model can omit them instead of
        // sending an empty value the endpoint would filter on.
        required: tool.params.filter((p) => p.required !== false).map((p) => p.name),
      },
    },
  };
}

function endpoint(baseUrl: string | null | undefined): string {
  const base = (baseUrl ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("El proveedor openai_compat requiere base_url.");
  return `${base}/chat/completions`;
}

function buildBody(req: ChatRequest, stream: boolean) {
  return JSON.stringify({
    model: req.modelName,
    messages: buildMessages(req),
    temperature: req.temperature,
    top_p: req.topP,
    max_tokens: req.maxTokens,
    stream,
    // Ask the backend to append a final chunk with token usage. Supported by
    // OpenAI and most compatible backends; ignored/absent on those that don't.
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(req.tools?.length
      ? { tools: req.tools.map(toOpenAiFunction), tool_choice: "auto" }
      : {}),
  });
}

function headers(ctx: AdapterContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ctx.apiKey}`,
  };
}

export async function chat(req: ChatRequest, ctx: AdapterContext): Promise<ChatResponse> {
  const res = await fetch(endpoint(ctx.baseUrl), {
    method: "POST",
    headers: headers(ctx),
    body: buildBody(req, false),
  });
  if (!res.ok) {
    throw new Error(`Error del proveedor (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const message = data.choices?.[0]?.message;
  // Null content is normal when the model stopped to call a tool.
  const content: string = message?.content ?? "";
  const toolCalls: ToolCall[] | undefined = message?.tool_calls?.length
    ? message.tool_calls.map((c: OpenAIToolCall) => ({
        id: c.id,
        name: c.function?.name ?? "",
        args: c.function?.arguments ?? "{}",
      }))
    : undefined;
  // TODO: some openai-compat backends omit usage; we report 0 in that case.
  const tokensIn: number = data.usage?.prompt_tokens ?? 0;
  const tokensOut: number = data.usage?.completion_tokens ?? 0;
  const truncated = data.choices?.[0]?.finish_reason === "length";
  return { content, toolCalls, tokensIn, tokensOut, truncated };
}

export async function* streamChat(
  req: ChatRequest,
  ctx: AdapterContext,
): AsyncIterable<StreamChunk> {
  const res = await fetch(endpoint(ctx.baseUrl), {
    method: "POST",
    headers: headers(ctx),
    body: buildBody(req, true),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Error del proveedor (${res.status}): ${await res.text()}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Captured from the usage-bearing chunk when the backend includes it; stays
  // 0 otherwise (some openai-compat backends omit usage entirely).
  let tokensIn = 0;
  let tokensOut = 0;
  let finishReason: string | null = null;
  let done = false;
  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        done = true;
        break;
      }
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) yield { type: "text", text: delta };
        if (json.choices?.[0]?.finish_reason) {
          finishReason = json.choices[0].finish_reason;
        }
        if (json.usage) {
          tokensIn = json.usage.prompt_tokens ?? tokensIn;
          tokensOut = json.usage.completion_tokens ?? tokensOut;
        }
      } catch {
        // Ignore partial/non-JSON keepalive lines.
      }
    }
  }
  yield { type: "usage", tokensIn, tokensOut, truncated: finishReason === "length" };
}

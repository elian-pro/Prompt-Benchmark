/**
 * Running a client's agent tools during a turn.
 *
 * The client's real agent lives in n8n, where the AI Agent node calls HTTP
 * tools that hit the client's own Supabase RPCs. This is that loop: hand the
 * model the tool definitions, run whatever it asks for, feed the results back,
 * ask again. Same shape as n8n, including the part where a failing tool is
 * reported to the model as text instead of blowing up the turn.
 *
 * The tool steps never become conversation rows (see lib/demo-turn.ts), which
 * matches n8n's Simple Memory: the next turn sees the question and the answer,
 * not the plumbing in between.
 */
// Types only: this module must stay importable (and testable) without pulling
// in the provider layer and its Supabase-backed key lookup. The caller passes
// the real `chat`.
import type { ChatRequest, ChatResponse, ToolDef } from "./providers/types";
import type { RuntimeTool } from "./db/client-tools";

/** How many times the model may stop to call tools before it must answer. */
export const MAX_TOOL_ROUNDS = 3;
const TOOL_TIMEOUT_MS = 10_000;
/** ~2k tokens. A `select *` with no limit would otherwise eat the context
 *  window and the bill. */
const TOOL_MAX_CHARS = 8_000;

/** What a tool did on a turn. Playground diagnostics only, never sent to the
 *  model and never shown on a demo link. */
export type ToolStep = {
  name: string;
  args: string;
  ok: boolean;
  status: number | null;
  ms: number;
  preview: string;
};

/**
 * Only https, and only hosts we accept. Checked when saving AND again right
 * before the request: rows get edited by hand in the SQL editor.
 */
export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("La URL de la herramienta no es válida.");
  }
  if (url.protocol !== "https:") {
    throw new Error("La URL de la herramienta debe usar https.");
  }
  const extra = (process.env.TOOL_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!url.hostname.endsWith(".supabase.co") && !extra.includes(url.hostname)) {
    throw new Error(
      `El host "${url.hostname}" no está permitido. Usa una URL de Supabase o añádelo a TOOL_HOST_ALLOWLIST.`,
    );
  }
  return url;
}

/** The request body: the fixed fields plus whatever the model filled in. For a
 *  PostgREST RPC that object IS the argument list. */
export function buildToolBody(
  tool: Pick<RuntimeTool, "bodyTemplate">,
  rawArgs: string,
): Record<string, unknown> {
  let args: Record<string, unknown> = {};
  if (rawArgs.trim()) {
    const parsed = JSON.parse(rawArgs);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    }
  }
  return { ...tool.bodyTemplate, ...args };
}

export function toToolDef(tool: RuntimeTool): ToolDef {
  return { name: tool.name, description: tool.description, params: tool.params };
}

export function truncate(body: string): string {
  return body.length > TOOL_MAX_CHARS
    ? `${body.slice(0, TOOL_MAX_CHARS)}\n… (respuesta truncada)`
    : body;
}

/**
 * Calls one tool. NEVER throws: a timeout, a 401 or a malformed argument comes
 * back as the tool's result, so the model can say something sensible instead
 * of the turn dying with a 500.
 */
export async function executeTool(
  tool: RuntimeTool | undefined,
  call: { name: string; args: string },
): Promise<{ content: string; step: ToolStep }> {
  const started = Date.now();
  const fail = (content: string, status: number | null = null): { content: string; step: ToolStep } => ({
    content,
    step: {
      name: call.name,
      args: call.args,
      ok: false,
      status,
      ms: Date.now() - started,
      preview: content.slice(0, 500),
    },
  });

  if (!tool) return fail(`Error: la herramienta "${call.name}" no existe.`);

  let url: URL;
  let body: Record<string, unknown>;
  try {
    url = assertAllowedUrl(tool.url);
    body = buildToolBody(tool, call.args);
  } catch (err) {
    return fail(`Error: ${err instanceof Error ? err.message : "argumentos inválidos"}.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...tool.headers },
      body: JSON.stringify(body),
      // A 302 to a metadata endpoint would walk straight past the allowlist.
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    // ponytail: reads the whole body before truncating. Streaming the cutoff
    // only matters if a client RPC ever returns something enormous.
    const text = truncate(await res.text());
    if (res.status >= 300 && res.status < 400) {
      return fail("Error: la herramienta respondió con una redirección.", res.status);
    }
    if (!res.ok) {
      return fail(`Error ${res.status} de la herramienta: ${text}`, res.status);
    }
    return {
      content: text,
      step: {
        name: call.name,
        args: call.args,
        ok: true,
        status: res.status,
        ms: Date.now() - started,
        preview: text.slice(0, 500),
      },
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return fail(
      timedOut
        ? "Error: la herramienta tardó demasiado en responder."
        : `Error al llamar la herramienta: ${err instanceof Error ? err.message : "desconocido"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the model, runs whatever tools it asks for, asks again. Returns the
 * final reply plus the trace.
 *
 * `chat` comes from the caller (the provider layer) and `exec` defaults to the
 * real HTTP call, so a test can drive the whole loop without a network.
 */
export async function runToolLoop(
  base: ChatRequest,
  tools: RuntimeTool[],
  deps: {
    chat: (req: ChatRequest) => Promise<ChatResponse>;
    exec?: typeof executeTool;
  },
): Promise<{ reply: ChatResponse; steps: ToolStep[] }> {
  const chat = deps.chat;
  const exec = deps.exec ?? executeTool;
  const defs = tools.length ? tools.map(toToolDef) : undefined;

  const messages = [...base.messages];
  let reply = await chat({ ...base, messages, tools: defs });
  const steps: ToolStep[] = [];
  if (!defs) return { reply, steps };

  for (let round = 0; reply.toolCalls?.length && round < MAX_TOOL_ROUNDS; round++) {
    messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
    const results: { id: string; content: string }[] = [];
    for (const call of reply.toolCalls) {
      const { content, step } = await exec(
        tools.find((t) => t.name === call.name),
        call,
      );
      results.push({ id: call.id, content });
      steps.push(step);
    }
    messages.push({ role: "user", content: "", toolResults: results });
    // The last round goes without tools, so the model has to answer with text
    // instead of asking for a fourth one.
    const isLast = round === MAX_TOOL_ROUNDS - 1;
    reply = await chat({ ...base, messages, tools: isLast ? undefined : defs });
  }

  return { reply, steps };
}

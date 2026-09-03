import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertAllowedUrl,
  buildToolBody,
  runToolLoop,
  toToolDef,
  truncate,
  MAX_TOOL_ROUNDS,
} from "./client-tools.ts";
import { toOpenAiFunction } from "./providers/openai-compat.ts";

/**
 * The loop hands a client's Supabase RPCs to the bot under test. Two things
 * are worth a test: that a saved URL cannot point somewhere it shouldn't, and
 * that the loop stops asking for tools instead of spinning.
 */

const TOOL = {
  id: "t1",
  name: "buscar_modelo_por_nombre",
  description: "Busca un modelo por nombre.",
  url: "https://abc.supabase.co/rest/v1/rpc/buscar_modelo_por_nombre",
  headers: { apikey: "k" },
  params: [{ name: "termino", description: "El nombre del modelo", type: "string" as const }],
  bodyTemplate: { max_resultados: 8 },
};

test("the allowlist accepts Supabase and refuses everything else", () => {
  assert.equal(assertAllowedUrl(TOOL.url).hostname, "abc.supabase.co");
  for (const bad of [
    "http://abc.supabase.co/rest/v1/rpc/f", // not https
    "https://evil.com/rest/v1/rpc/f",
    "https://xsupabase.co/rest/v1/rpc/f", // the dot matters
    "https://127.0.0.1/rest/v1/rpc/f",
    "no-es-una-url",
  ]) {
    assert.throws(() => assertAllowedUrl(bad), /./, `debió rechazar ${bad}`);
  }
});

test("TOOL_HOST_ALLOWLIST opens a host, and only that host", () => {
  process.env.TOOL_HOST_ALLOWLIST = "api.cliente.mx, otro.mx";
  try {
    assert.equal(assertAllowedUrl("https://api.cliente.mx/x").hostname, "api.cliente.mx");
    assert.throws(() => assertAllowedUrl("https://sub.api.cliente.mx/x"));
  } finally {
    delete process.env.TOOL_HOST_ALLOWLIST;
  }
});

test("the body is the fixed fields plus the model's arguments, and the model wins", () => {
  assert.deepEqual(buildToolBody(TOOL, '{"termino":"KPT 200"}'), {
    max_resultados: 8,
    termino: "KPT 200",
  });
  assert.deepEqual(buildToolBody(TOOL, '{"max_resultados":2}'), { max_resultados: 2 });
  assert.deepEqual(buildToolBody(TOOL, ""), { max_resultados: 8 });
  // Malformed arguments throw here and are caught by executeTool, which
  // reports them to the model instead of failing the turn.
  assert.throws(() => buildToolBody(TOOL, "{no es json"));
});

test("an optional parameter left empty is dropped, so the RPC uses its default", () => {
  // recomendar_vehiculos: every p_* is `default null` in Postgres, and a model
  // that does not know the style sends "" for it.
  const recommend = {
    bodyTemplate: { max_resultados: 5 },
    params: [
      { name: "p_tipo", description: "", type: "string" as const, required: false },
      { name: "p_estilo", description: "", type: "string" as const, required: false },
      { name: "p_presupuesto_max", description: "", type: "number" as const, required: false },
    ],
  };
  assert.deepEqual(
    buildToolBody(recommend, '{"p_tipo":"moto","p_estilo":"","p_presupuesto_max":0}'),
    { max_resultados: 5, p_tipo: "moto" },
  );
});

test("a required parameter is sent even when it comes back empty", () => {
  // Nothing to fall back to: dropping it would make PostgREST fail to resolve
  // the function at all.
  const search = { bodyTemplate: {}, params: [{ name: "termino", description: "", type: "string" as const }] };
  assert.deepEqual(buildToolBody(search, '{"termino":""}'), { termino: "" });
});

test("only required parameters go in the schema's required list", () => {
  const fn = toOpenAiFunction(
    toToolDef({
      ...TOOL,
      params: [
        { name: "a", description: "", type: "string", required: false },
        { name: "b", description: "", type: "string" },
      ],
    }),
  );
  assert.deepEqual(fn.function.parameters.required, ["b"]);
  assert.deepEqual(Object.keys(fn.function.parameters.properties), ["a", "b"]);
});

test("a tool becomes a function with one required property per parameter", () => {
  const fn = toOpenAiFunction(toToolDef(TOOL));
  assert.equal(fn.function.name, "buscar_modelo_por_nombre");
  assert.deepEqual(fn.function.parameters, {
    type: "object",
    properties: { termino: { type: "string", description: "El nombre del modelo" } },
    required: ["termino"],
  });
});

test("an oversized response is cut and says so", () => {
  const cut = truncate("x".repeat(9_000));
  assert.ok(cut.length < 9_000);
  assert.match(cut, /respuesta truncada/);
});

test("the loop runs the tools, feeds the results back and returns the final text", async () => {
  const asked: (string | undefined)[] = [];
  const calls: string[] = [];
  const chat = async (req: any) => {
    asked.push(req.tools ? "con tools" : "sin tools");
    if (asked.length === 1) {
      return {
        content: "",
        toolCalls: [{ id: "c1", name: TOOL.name, args: '{"termino":"KPT"}' }],
        tokensIn: 1,
        tokensOut: 1,
        truncated: false,
      };
    }
    // The results message must reach the provider as its own turn.
    assert.equal(req.messages.at(-1).toolResults[0].id, "c1");
    return { content: '{"estado":"perfilado"}', tokensIn: 1, tokensOut: 1, truncated: false };
  };
  const exec = async (tool: any, call: any) => {
    calls.push(call.name);
    return {
      content: '[{"modelo":"KPT 200","precio":52900}]',
      step: { name: call.name, args: call.args, ok: true, status: 200, ms: 12, preview: "[]" },
    };
  };

  const { reply, steps } = await runToolLoop(
    { providerId: "p", modelName: "m", messages: [{ role: "user", content: "¿tienen la KPT?" }] },
    [TOOL],
    { chat, exec },
  );

  assert.equal(reply.content, '{"estado":"perfilado"}');
  assert.deepEqual(calls, [TOOL.name]);
  assert.equal(steps.length, 1);
  assert.deepEqual(asked, ["con tools", "con tools"]);
});

test("the last round drops the tools so the model has to answer", async () => {
  const asked: string[] = [];
  // A model that would keep asking forever.
  const chat = async (req: any) => {
    asked.push(req.tools ? "con tools" : "sin tools");
    return {
      content: "",
      toolCalls: [{ id: `c${asked.length}`, name: TOOL.name, args: "{}" }],
      tokensIn: 1,
      tokensOut: 1,
      truncated: false,
    };
  };
  const exec = async (_tool: any, call: any) => ({
    content: "[]",
    step: { name: call.name, args: call.args, ok: true, status: 200, ms: 1, preview: "[]" },
  });

  const { steps } = await runToolLoop(
    { providerId: "p", modelName: "m", messages: [{ role: "user", content: "hola" }] },
    [TOOL],
    { chat, exec },
  );

  assert.equal(steps.length, MAX_TOOL_ROUNDS);
  assert.equal(asked.at(-1), "sin tools");
  assert.equal(asked.length, MAX_TOOL_ROUNDS + 1);
});

test("with no tools configured the call is a plain one", async () => {
  let seen: any = null;
  const chat = async (req: any) => {
    seen = req;
    return { content: "hola", tokensIn: 0, tokensOut: 0, truncated: false };
  };
  const { steps } = await runToolLoop(
    { providerId: "p", modelName: "m", messages: [{ role: "user", content: "hola" }] },
    [],
    { chat },
  );
  assert.equal(seen.tools, undefined);
  assert.deepEqual(steps, []);
});

test("the trace has one request/response pair per chat() call, tool round included", async () => {
  const chat = async (req: any) => {
    if (!req.messages.at(-1).toolResults) {
      return {
        content: "",
        toolCalls: [{ id: "c1", name: TOOL.name, args: "{}" }],
        tokensIn: 1,
        tokensOut: 1,
        truncated: false,
      };
    }
    return { content: '{"estado":"perfilado"}', tokensIn: 1, tokensOut: 1, truncated: false };
  };
  const exec = async (_tool: any, call: any) => ({
    content: "[]",
    step: { name: call.name, args: call.args, ok: true, status: 200, ms: 1, preview: "[]" },
  });

  const { trace } = await runToolLoop(
    { providerId: "p", modelName: "m", messages: [{ role: "user", content: "hola" }] },
    [TOOL],
    { chat, exec },
  );

  assert.equal(trace.length, 2);
  assert.equal(trace[0].response.toolCalls?.[0].name, TOOL.name);
  assert.equal(trace[1].request.messages.at(-1)?.toolResults?.[0].id, "c1");
});

test("with no tools configured, trace has exactly the one plain call", async () => {
  const chat = async (req: any) => {
    void req;
    return { content: "hola", tokensIn: 0, tokensOut: 0, truncated: false };
  };
  const { trace } = await runToolLoop(
    { providerId: "p", modelName: "m", messages: [{ role: "user", content: "hola" }] },
    [],
    { chat },
  );
  assert.equal(trace.length, 1);
});

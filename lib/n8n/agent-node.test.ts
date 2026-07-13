/**
 * Unit tests for the AI Agent node helpers (no DB / no network).
 * Run with: node --test --experimental-strip-types lib/n8n/agent-node.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AI_AGENT_TYPE,
  computePushWarnings,
  hasExpressionTokens,
  listAgentNodes,
  locateBoundAgent,
  readSystemMessage,
  setRawSystemMessage,
  toRawSystemMessage,
  writeSystemMessage,
  type N8nNode,
  type N8nWorkflow,
} from "./agent-node.ts";

function agent(id: string, name: string, systemMessage?: string): N8nNode {
  return {
    id,
    name,
    type: AI_AGENT_TYPE,
    parameters: systemMessage === undefined ? {} : { options: { systemMessage } },
  };
}

function workflow(nodes: N8nNode[]): N8nWorkflow {
  return { id: "wf1", name: "Flujo", nodes, connections: {} };
}

test("readSystemMessage reads a plain prompt", () => {
  const node = agent("a", "Agent", "Eres un asistente.");
  assert.deepEqual(readSystemMessage(node), {
    text: "Eres un asistente.",
    expression_prefix: false,
  });
});

test("readSystemMessage strips the = expression marker", () => {
  const node = agent("a", "Agent", "=Hola {{ $json.name }}");
  assert.deepEqual(readSystemMessage(node), {
    text: "Hola {{ $json.name }}",
    expression_prefix: true,
  });
});

test("readSystemMessage tolerates a missing options object", () => {
  const node = agent("a", "Agent");
  assert.deepEqual(readSystemMessage(node), { text: "", expression_prefix: false });
});

test("toRawSystemMessage re-applies the = marker only when needed", () => {
  assert.equal(toRawSystemMessage("hola", false), "hola");
  assert.equal(toRawSystemMessage("hola", true), "=hola");
});

test("writeSystemMessage sets the value without mutating the original", () => {
  const node = agent("a", "Agent", "viejo");
  const next = writeSystemMessage(node, "nuevo", false);
  assert.equal(next.parameters!.options.systemMessage, "nuevo");
  assert.equal(node.parameters!.options.systemMessage, "viejo");
});

test("writeSystemMessage preserves the expression prefix", () => {
  const node = agent("a", "Agent", "=viejo {{ $json.x }}");
  const next = writeSystemMessage(node, "nuevo {{ $json.x }}", true);
  assert.equal(next.parameters!.options.systemMessage, "=nuevo {{ $json.x }}");
});

test("writeSystemMessage creates options when the node lacks one", () => {
  const node = agent("a", "Agent");
  const next = writeSystemMessage(node, "nuevo", false);
  assert.equal(next.parameters!.options.systemMessage, "nuevo");
});

test("setRawSystemMessage writes the exact raw string, marker included", () => {
  const node = agent("a", "Agent", "nuevo");
  const next = setRawSystemMessage(node, "=viejo {{ $json.x }}");
  assert.equal(next.parameters!.options.systemMessage, "=viejo {{ $json.x }}");
  assert.equal(node.parameters!.options.systemMessage, "nuevo");
});

test("listAgentNodes returns only agents, with a one-line preview", () => {
  const wf = workflow([
    { id: "web", name: "Webhook", type: "n8n-nodes-base.webhook", parameters: {} },
    agent("ag1", "Agente ventas", "=\nEres el asesor de ventas.\nSé breve."),
  ]);
  const agents = listAgentNodes(wf);
  assert.equal(agents.length, 1);
  assert.equal(agents[0].node_id, "ag1");
  assert.equal(agents[0].preview, "Eres el asesor de ventas.");
  assert.equal(agents[0].expression_prefix, true);
});

test("locateBoundAgent finds by id", () => {
  const wf = workflow([agent("ag1", "Agente", "x")]);
  const r = locateBoundAgent(wf, { node_id: "ag1", node_name: "otro" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.matched_by, "id");
});

test("locateBoundAgent falls back to name when the id changed", () => {
  const wf = workflow([agent("new-id", "Agente ventas", "x")]);
  const r = locateBoundAgent(wf, { node_id: "old-id", node_name: "Agente ventas" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.matched_by, "name");
});

test("locateBoundAgent reports not_found", () => {
  const wf = workflow([agent("ag1", "Agente", "x")]);
  const r = locateBoundAgent(wf, { node_id: "nope", node_name: "tampoco" });
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});

test("locateBoundAgent refuses a node that is no longer an agent", () => {
  const wf = workflow([
    { id: "ag1", name: "Agente", type: "n8n-nodes-base.set", parameters: {} },
  ]);
  const r = locateBoundAgent(wf, { node_id: "ag1", node_name: "Agente" });
  assert.deepEqual(r, { ok: false, reason: "not_agent" });
});

test("hasExpressionTokens detects {{ }} interpolation", () => {
  assert.equal(hasExpressionTokens("hola {{ $json.name }}"), true);
  assert.equal(hasExpressionTokens("hola mundo"), false);
});

test("computePushWarnings flags dropped interpolation", () => {
  const w = computePushWarnings({
    currentRaw: "=Hola {{ $json.name }}",
    nextText: "Hola cliente",
    expressionPrefix: true,
  });
  assert.deepEqual(w, ["drops_interpolation"]);
});

test("computePushWarnings flags new literal braces in an expression field", () => {
  const w = computePushWarnings({
    currentRaw: "=Hola",
    nextText: "Usa el formato {{clave}}",
    expressionPrefix: true,
  });
  assert.deepEqual(w, ["new_braces_evaluated"]);
});

test("computePushWarnings is silent for a plain prompt", () => {
  const w = computePushWarnings({
    currentRaw: "Hola",
    nextText: "Hola de nuevo",
    expressionPrefix: false,
  });
  assert.deepEqual(w, []);
});

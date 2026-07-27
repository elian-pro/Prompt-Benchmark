/**
 * Unit tests for the n8n REST client's pure helpers (no network).
 * Run with: node --test --experimental-strip-types lib/n8n/client.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createWorkflow, sanitizeForUpdate, sanitizeSettings } from "./client.ts";
import type { N8nWorkflow } from "./agent-node.ts";

/** Runs `fn` with fetch stubbed, returning the single captured request. */
async function captureRequest(
  responseBody: unknown,
  fn: () => Promise<unknown>,
): Promise<{ url: string; init: RequestInit }> {
  const original = globalThis.fetch;
  let captured: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(captured, "fetch was never called");
  return captured!;
}

test("sanitizeForUpdate keeps only writable fields", () => {
  const wf = {
    id: "wf1",
    name: "Flujo",
    active: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    tags: [{ id: "t1" }],
    versionId: "abc",
    nodes: [{ id: "a", name: "A", type: "x" }],
    connections: { A: {} },
    settings: { executionOrder: "v1" },
  } as unknown as N8nWorkflow;

  const out = sanitizeForUpdate(wf);
  assert.deepEqual(Object.keys(out).sort(), ["connections", "name", "nodes", "settings"]);
  assert.equal((out as any).id, undefined);
  assert.equal((out as any).active, undefined);
  assert.equal((out as any).tags, undefined);
});

test("sanitizeForUpdate defaults settings to an empty object", () => {
  const wf = {
    name: "Flujo",
    nodes: [],
    connections: {},
  } as unknown as N8nWorkflow;
  assert.deepEqual((sanitizeForUpdate(wf) as any).settings, {});
});

test("sanitizeSettings drops UI/enterprise-only keys the PUT rejects", () => {
  // Shape as returned by GET on a real workflow. The extra keys 400 on PUT.
  const settings = {
    executionOrder: "v1",
    errorWorkflow: "DZXbenEKvV03aJru",
    timeSavedMode: "fixed",
    timeSavedPerExecution: 1,
    callerPolicy: "workflowsFromSameOwner",
    availableInMCP: true,
    binaryMode: "separate",
  };
  assert.deepEqual(sanitizeSettings(settings), {
    executionOrder: "v1",
    errorWorkflow: "DZXbenEKvV03aJru",
  });
});

test("sanitizeSettings tolerates null/undefined", () => {
  assert.deepEqual(sanitizeSettings(null), {});
  assert.deepEqual(sanitizeSettings(undefined), {});
});

test("createWorkflow posts a sanitized copy to /workflows", async () => {
  // A template exactly as GET returns it: read-only fields and UI-only
  // settings keys included, which is what duplication has to strip.
  const template = {
    id: "tpl1",
    name: "IA Mensajes PLANTILLA",
    active: true,
    createdAt: "2026-01-01",
    tags: [{ id: "t1" }],
    versionId: "abc",
    pinData: { A: [] },
    nodes: [{ id: "a", name: "AI Agent", type: "@n8n/n8n-nodes-langchain.agent" }],
    connections: { "AI Agent": {} },
    settings: { executionOrder: "v1", callerPolicy: "workflowsFromSameOwner" },
  } as unknown as N8nWorkflow;

  const { url, init } = await captureRequest({ id: "new1" }, () =>
    createWorkflow(
      { baseUrl: "https://n8n.test/", apiKey: "k" },
      { ...template, name: "IA Mensajes Acalai" },
    ),
  );

  assert.equal(url, "https://n8n.test/api/v1/workflows");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>)["X-N8N-API-KEY"], "k");

  const body = JSON.parse(init.body as string);
  assert.deepEqual(Object.keys(body).sort(), ["connections", "name", "nodes", "settings"]);
  assert.equal(body.name, "IA Mensajes Acalai");
  assert.deepEqual(body.settings, { executionOrder: "v1" });
  assert.equal(body.nodes.length, 1);
});

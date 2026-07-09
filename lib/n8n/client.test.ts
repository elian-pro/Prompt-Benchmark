/**
 * Unit tests for the n8n REST client's pure helpers (no network).
 * Run with: node --test --experimental-strip-types lib/n8n/client.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeForUpdate } from "./client.ts";
import type { N8nWorkflow } from "./agent-node.ts";

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

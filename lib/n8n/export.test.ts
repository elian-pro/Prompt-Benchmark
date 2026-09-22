/**
 * Unit tests for buildWorkflowExport.
 * Run with: node --test --experimental-strip-types lib/n8n/export.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWorkflowExport } from "./export.ts";
import { POSTGRES_NODE_TYPE } from "./chats-table.ts";
import type { N8nWorkflow } from "./agent-node.ts";

const template = (): N8nWorkflow => ({
  id: "bm8tNV9sujPPMHfm",
  name: "IA mensajes Plantilla GHL",
  active: true,
  versionId: "abc",
  tags: [{ id: "1", name: "plantillas" }],
  pinData: { "Webhook Lezgo": [{ json: { phone: "+52..." } }] },
  settings: { executionOrder: "v1" },
  connections: { "Webhook Lezgo": {} },
  nodes: [
    {
      id: "n1",
      name: "Registra turno lead",
      type: POSTGRES_NODE_TYPE,
      webhookId: "6d801f6d",
      credentials: { postgres: { id: "9", name: "Postgres Zebra" } },
      parameters: {
        operation: "executeQuery",
        query: 'INSERT INTO "Lezgo".chats (id_crm) VALUES ($1)',
      },
    },
  ],
});

test("renames, retargets and strips what only means something in our n8n", () => {
  const { json, retargeted } = buildWorkflowExport(template(), {
    name: "IA Mensajes Acalai",
    schema: "Acalai",
  });
  const out = JSON.parse(json);

  assert.equal(out.name, "IA Mensajes Acalai");
  assert.equal(retargeted, 1);
  assert.ok(out.nodes[0].parameters.query.includes('"Acalai".chats'));
  // Only the SQL is rewritten. A node NAMED after the template's client keeps
  // its name, in the nodes and in the connections that reference it by name.
  assert.ok(!out.nodes[0].parameters.query.includes("Lezgo"));

  // Nothing of our instance travels with it.
  assert.deepEqual(Object.keys(out).sort(), ["connections", "name", "nodes", "settings"]);
  assert.equal(out.nodes[0].credentials, undefined);
  assert.equal(out.nodes[0].webhookId, undefined);
  assert.ok(!json.includes("Postgres Zebra"));

  // What the flow needs to run stays.
  assert.deepEqual(out.settings, { executionOrder: "v1" });
  assert.deepEqual(out.connections, { "Webhook Lezgo": {} });
  assert.equal(out.nodes[0].type, POSTGRES_NODE_TYPE);
});

test("does not mutate the source workflow", () => {
  const source = template();
  buildWorkflowExport(source, { name: "IA Mensajes Acalai", schema: "Acalai" });
  assert.equal(source.name, "IA mensajes Plantilla GHL");
  assert.ok((source.nodes[0].parameters as any).query.includes('"Lezgo".chats'));
  assert.ok(source.nodes[0].credentials);
});

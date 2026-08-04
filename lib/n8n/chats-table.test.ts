/**
 * Unit tests for retargetChatsTable.
 * Run with: node --test --experimental-strip-types lib/n8n/chats-table.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { retargetChatsTable, SUPABASE_NODE_TYPE } from "./chats-table.ts";
import type { N8nWorkflow } from "./agent-node.ts";

function wf(nodes: N8nWorkflow["nodes"]): N8nWorkflow {
  return { name: "IA mensajes Plantilla", nodes, connections: {} };
}

const supabase = (id: string, tableId: unknown) => ({
  id,
  name: id,
  type: SUPABASE_NODE_TYPE,
  parameters: { operation: "update", tableId },
});

test("points every chats_* Supabase node at the client's table", () => {
  const out = retargetChatsTable(
    wf([
      supabase("Get a row", "chats_Valcasa"),
      supabase("Update a row", "chats_Valcasa"),
      { id: "agent", name: "AI Agent", type: "@n8n/n8n-nodes-langchain.agent", parameters: {} },
    ]),
    "chats_Kuyabeh",
  );
  assert.equal(out.retargeted, 2);
  assert.deepEqual(
    out.workflow.nodes.map((n) => n.parameters?.tableId),
    ["chats_Kuyabeh", "chats_Kuyabeh", undefined],
  );
});

test("leaves Supabase nodes reading a non-chats table alone", () => {
  const out = retargetChatsTable(wf([supabase("Get a row", "vehiculos")]), "chats_Kuyabeh");
  assert.equal(out.retargeted, 0);
  assert.equal(out.workflow.nodes[0].parameters?.tableId, "vehiculos");
});

test("handles the resource-locator shape and keeps its other keys", () => {
  const out = retargetChatsTable(
    wf([supabase("Get a row", { __rl: true, mode: "list", value: "chats_Valcasa" })]),
    "chats_Kuyabeh",
  );
  assert.equal(out.retargeted, 1);
  assert.deepEqual(out.workflow.nodes[0].parameters?.tableId, {
    __rl: true,
    mode: "list",
    value: "chats_Kuyabeh",
  });
});

test("counts nothing when the template already points at the right table", () => {
  const out = retargetChatsTable(wf([supabase("Get a row", "chats_Kuyabeh")]), "chats_Kuyabeh");
  assert.equal(out.retargeted, 0);
});

test("does not mutate the workflow it was given", () => {
  const original = wf([supabase("Get a row", "chats_Valcasa")]);
  retargetChatsTable(original, "chats_Kuyabeh");
  assert.equal(original.nodes[0].parameters?.tableId, "chats_Valcasa");
});

test("refuses a table name that is not a valid chats_* identifier", () => {
  assert.throws(() => retargetChatsTable(wf([]), "leads; drop table"), /inválido/);
});

/**
 * Unit tests for retargetChatsTable.
 * Run with: node --test --experimental-strip-types lib/n8n/chats-table.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  retargetChatsTable,
  countLegacySupabaseNodes,
  POSTGRES_NODE_TYPE,
  SUPABASE_NODE_TYPE,
} from "./chats-table.ts";
import type { N8nWorkflow } from "./agent-node.ts";

function wf(nodes: N8nWorkflow["nodes"]): N8nWorkflow {
  return { name: "IA mensajes Plantilla", nodes, connections: {} };
}

const rl = (value: string) => ({ __rl: true, mode: "name", value });

/** A conversation node as the migrated template carries it. */
const pg = (id: string, schema: string, table = "chats") => ({
  id,
  name: id,
  type: POSTGRES_NODE_TYPE,
  parameters: { operation: "update", schema: rl(schema), table: rl(table) },
});

const schemaOf = (n: { parameters?: Record<string, unknown> }) =>
  (n.parameters?.schema as { value?: string } | undefined)?.value;

test("points every chats node at the client's schema", () => {
  const out = retargetChatsTable(
    wf([
      pg("Get a row", "Valcasa"),
      pg("Update a row", "Valcasa"),
      { id: "agent", name: "AI Agent", type: "@n8n/n8n-nodes-langchain.agent", parameters: {} },
    ]),
    "Grupo de la Torre",
  );
  assert.equal(out.retargeted, 2);
  assert.deepEqual(out.workflow.nodes.map(schemaOf), [
    "Grupo de la Torre",
    "Grupo de la Torre",
    undefined,
  ]);
});

test("leaves a Postgres node reading another table alone", () => {
  const out = retargetChatsTable(wf([pg("Get a row", "Valcasa", "vehiculos")]), "Acalai");
  assert.equal(out.retargeted, 0);
  assert.equal(schemaOf(out.workflow.nodes[0]), "Valcasa");
});

test("does not count a node already on the target schema", () => {
  const out = retargetChatsTable(
    wf([pg("a", "Acalai"), pg("b", "Valcasa")]),
    "Acalai",
  );
  assert.equal(out.retargeted, 1);
});

test("handles a schema stored as a plain string", () => {
  const node = {
    id: "n",
    name: "n",
    type: POSTGRES_NODE_TYPE,
    parameters: { schema: "Valcasa", table: "chats" },
  };
  const out = retargetChatsTable(wf([node]), "Sofía");
  assert.equal(out.retargeted, 1);
  assert.equal(schemaOf(out.workflow.nodes[0]), "Sofía");
});

test("does not mutate the input workflow", () => {
  const input = wf([pg("Get a row", "Valcasa")]);
  retargetChatsTable(input, "Acalai");
  assert.equal(schemaOf(input.nodes[0]), "Valcasa");
});

test("rejects an invalid schema name", () => {
  assert.throws(() => retargetChatsTable(wf([pg("a", "Valcasa")]), " Acalai"));
  assert.throws(() => retargetChatsTable(wf([pg("a", "Valcasa")]), ""));
});

test("countLegacySupabaseNodes catches a template that was never migrated", () => {
  // This is the case that made the August 2026 migration dangerous: the flows
  // moved to Postgres nodes while the retarget still looked for Supabase ones,
  // so a copy silently kept writing to the template client's history.
  const legacy = wf([
    { id: "s", name: "Get a row", type: SUPABASE_NODE_TYPE, parameters: { tableId: "chats_Valcasa" } },
  ]);
  assert.equal(countLegacySupabaseNodes(legacy), 1);
  assert.equal(retargetChatsTable(legacy, "Acalai").retargeted, 0);
  assert.equal(countLegacySupabaseNodes(wf([pg("a", "Valcasa")])), 0);
});

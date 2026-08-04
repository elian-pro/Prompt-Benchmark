/**
 * Retargeting the Supabase nodes of a duplicated template.
 *
 * The template is a copy of a real client's workflow, so its Supabase nodes
 * carry that client's `chats_*` table. Duplicating it verbatim would make the
 * new client write its conversations into someone else's history, which is why
 * this runs on every copy instead of relying on a human editing eight nodes.
 *
 * Only nodes whose current table is a `chats_*` name are touched: a Supabase
 * node reading some other table (a catalog, an RPC-backed table) is left
 * alone. Pure module, no network, so it can be unit-tested directly.
 */
// Extension-ful imports so `node --test` can run this module, same as
// lib/chats-admin.ts does.
import { isValidChatsTable } from "../chats-table-name.ts";
import type { N8nWorkflow, N8nNode } from "./agent-node.ts";

export const SUPABASE_NODE_TYPE = "n8n-nodes-base.supabase";

/** n8n stores a table either as a plain string or as a resource locator
 *  ({ __rl: true, value, mode }). Reads the name out of both shapes. */
function readTable(tableId: unknown): string | null {
  if (typeof tableId === "string") return tableId;
  if (tableId && typeof tableId === "object") {
    const value = (tableId as { value?: unknown }).value;
    if (typeof value === "string") return value;
  }
  return null;
}

/** Writes the name back in the same shape it was read in. */
function writeTable(tableId: unknown, table: string): unknown {
  if (typeof tableId === "string") return table;
  return { ...(tableId as object), value: table };
}

/**
 * Returns a copy of the workflow with every `chats_*` table in its Supabase
 * nodes pointed at `table`, plus how many nodes changed. A count of 0 means the
 * template had no chats node to retarget, which the caller should surface: it
 * usually means the template changed shape, not that everything is fine.
 */
export function retargetChatsTable(
  workflow: N8nWorkflow,
  table: string,
): { workflow: N8nWorkflow; retargeted: number } {
  if (!isValidChatsTable(table)) {
    throw new Error(`Nombre de tabla inválido: ${table}`);
  }
  let retargeted = 0;
  const nodes = workflow.nodes.map((node): N8nNode => {
    if (node.type !== SUPABASE_NODE_TYPE) return node;
    const current = readTable(node.parameters?.tableId);
    if (!current || !isValidChatsTable(current) || current === table) return node;
    retargeted++;
    return {
      ...node,
      parameters: { ...node.parameters, tableId: writeTable(node.parameters?.tableId, table) },
    };
  });
  return { workflow: { ...workflow, nodes }, retargeted };
}

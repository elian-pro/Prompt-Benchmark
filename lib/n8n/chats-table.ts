/**
 * Retargeting the conversation nodes of a duplicated template.
 *
 * The template is a copy of a real client's workflow, so its Postgres nodes
 * carry that client's schema. Duplicating it verbatim would make the new client
 * write its conversations into someone else's history, which is why this runs
 * on every copy instead of relying on a human editing nine nodes.
 *
 * Until August 2026 those were Supabase nodes carrying a `chats_*` tableId.
 * They are now Postgres nodes, in two shapes: the reads keep `schema`/`table`
 * resource locators, while the writes were ported to raw SQL and carry the
 * schema INSIDE `parameters.query` (`UPDATE "Valcasa".chats ...`). Both shapes
 * are rewritten. Only nodes pointing at the conversation table are touched: a
 * Postgres node reading anything else is left alone.
 *
 * Pure module, no network, so it can be unit-tested directly.
 */
// Extension-ful imports so `node --test` can run this module, same as
// lib/chats-admin.ts does.
import { isValidChatsTable, quoteIdent, CHATS_TABLE } from "../chats-table-name.ts";
import type { N8nWorkflow, N8nNode } from "./agent-node.ts";

export const POSTGRES_NODE_TYPE = "n8n-nodes-base.postgres";
/** Kept so an un-migrated template is recognized and reported, not silently skipped. */
export const SUPABASE_NODE_TYPE = "n8n-nodes-base.supabase";

/** n8n stores schema/table either as a plain string or as a resource locator
 *  ({ __rl: true, value, mode }). Reads the name out of both shapes. */
function readValue(field: unknown): string | null {
  if (typeof field === "string") return field;
  if (field && typeof field === "object") {
    const value = (field as { value?: unknown }).value;
    if (typeof value === "string") return value;
  }
  return null;
}

/** Writes the name back in the same shape it was read in. */
function writeValue(field: unknown, next: string): unknown {
  if (typeof field === "string" || field == null) {
    return { __rl: true, mode: "name", value: next };
  }
  return { ...(field as object), value: next };
}

/**
 * A reference to the conversation table inside raw SQL: `"Valcasa".chats`,
 * `Valcasa.chats` or a bare `chats`. Anchored on the keyword that introduces a
 * table so a column or an alias called chats is not rewritten. The unqualified
 * form is matched too: left alone it would resolve through search_path, which
 * is the same silent wrong-target failure this module exists to prevent.
 */
const CHATS_TARGET_RE =
  /\b(from|into|update|join)\s+(?:(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?chats\b/gi;

/** Rewrites every conversation-table reference of a raw query onto `schema`. */
function retargetQuery(query: string, schema: string): string {
  return query.replace(
    CHATS_TARGET_RE,
    (_match, keyword: string) => `${keyword} ${quoteIdent(schema)}.${CHATS_TABLE}`,
  );
}

/**
 * Returns a copy of the workflow with every conversation node pointed at
 * `schema`, plus how many nodes changed.
 *
 * A count of 0 means the template had no conversation node to retarget, which
 * the caller must surface: it usually means the template changed shape, not
 * that everything is fine. That is exactly what happened when the flows moved
 * off Supabase and this module still looked for Supabase nodes.
 */
export function retargetChatsTable(
  workflow: N8nWorkflow,
  schema: string,
): { workflow: N8nWorkflow; retargeted: number } {
  if (!isValidChatsTable(schema)) {
    throw new Error(`Nombre de esquema inválido: ${schema}`);
  }
  let retargeted = 0;
  const nodes = workflow.nodes.map((node): N8nNode => {
    if (node.type !== POSTGRES_NODE_TYPE) return node;
    // A ported write carries no schema/table field at all: the schema is a
    // literal inside the SQL. Rewriting only the locator nodes would retarget
    // the reads and leave every write on the template client's history.
    const query = node.parameters?.query;
    if (node.parameters?.operation === "executeQuery" && typeof query === "string") {
      const next = retargetQuery(query, schema);
      if (next === query) return node;
      retargeted++;
      return { ...node, parameters: { ...node.parameters, query: next } };
    }
    // Only the conversation table. A Postgres node hitting another table
    // (a catalog, a report) keeps its own schema.
    if (readValue(node.parameters?.table) !== CHATS_TABLE) return node;
    if (readValue(node.parameters?.schema) === schema) return node;
    retargeted++;
    return {
      ...node,
      parameters: {
        ...node.parameters,
        schema: writeValue(node.parameters?.schema, schema),
      },
    };
  });
  return { workflow: { ...workflow, nodes }, retargeted };
}

/**
 * How many Supabase nodes the workflow still has. Zero for a migrated
 * template. The provisioning step reports a non-zero count so a template that
 * was never migrated is caught before its copy starts writing to Supabase,
 * where nothing reads any more.
 */
export function countLegacySupabaseNodes(workflow: N8nWorkflow): number {
  return workflow.nodes.filter((n) => n.type === SUPABASE_NODE_TYPE).length;
}

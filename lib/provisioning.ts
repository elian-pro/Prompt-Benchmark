/**
 * Provisioning a client: the two manual steps the team used to do by hand
 * after creating a client in the Library.
 *
 *   1. duplicate the n8n template workflow and rename the copy
 *      "IA Mensajes <Cliente>", then bind its AI Agent node so promoting a
 *      version pushes the prompt (Sprint 7 sync);
 *   2. create the client's conversation schema (with its `chats` table) in the
 *      history database and connect it to the history panel.
 *
 * Two rules shape this module:
 *
 * - A step NEVER throws upward. The client already exists by the time we get
 *   here (creation and provisioning are separate requests on purpose), so a
 *   dead n8n or a missing token must not undo it. Every step returns a
 *   StepResult and the UI offers a retry.
 * - Every step is idempotent, keyed on the name it would create. Retrying
 *   after a half-done run adopts what is already there instead of making a
 *   second copy: no provisioning state is stored anywhere, the real world is
 *   the state.
 */
import type { Client } from "./db/clients";
import { getClient, updateClient } from "./db/clients";
import { getConnectionCreds, getConnection, listConnections } from "./db/n8n-connections";
import { createApiBinding, listBindings } from "./db/n8n-bindings";
import { listChatsTables } from "./db/chats-history";
import { isChatsConfigured } from "./supabase";
import { createWorkflow, getWorkflow, listWorkflows } from "./n8n/client";
import { listAgentNodes, pickPromptAgent } from "./n8n/agent-node";
import { retargetChatsTable, countLegacySupabaseNodes } from "./n8n/chats-table";
import { createChatsTable, isChatsAdminConfigured } from "./chats-admin";
import { chatsTableName } from "./chats-table-name";

export type StepResult =
  | { ok: true; detail: string }
  | {
      ok: false;
      error: string;
      /**
       * The copy exists but we could not pick its node: the UI opens the
       * binding modal on this workflow so the user chooses which agent gets
       * the prompt, instead of hunting for the flow by hand.
       */
      pick?: { connectionId: string; workflowId: string };
    };

export type ProvisioningResult = {
  workflow: StepResult | null;
  chats: StepResult | null;
};

export type ProvisionOptions = {
  duplicateWorkflow: boolean;
  /** Which template to copy. Resolved by the route (override or connection default). */
  template?: { connectionId: string; workflowId: string };
  createChatsTable: boolean;
};

/** The n8n name a client's workflow gets. Single source of truth. */
export function workflowNameFor(clientName: string): string {
  return `IA Mensajes ${clientName}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Error inesperado.";
}

/**
 * Duplicates the template for this client and binds its AI Agent node.
 *
 * Idempotency: if a workflow named "IA Mensajes <Cliente>" already exists on
 * the connection, it is adopted instead of duplicated, so retrying after a
 * failure that happened AFTER the copy (binding, network) cannot leave two
 * copies behind. Same for the binding: an existing api binding is left alone.
 */
async function duplicateAndBind(
  client: Client,
  template: { connectionId: string; workflowId: string },
): Promise<StepResult> {
  const wanted = workflowNameFor(client.name);
  const creds = await getConnectionCreds(template.connectionId);

  const existing = (await listWorkflows(creds)).find((w) => w.name === wanted);
  let workflowId: string;
  let adopted = false;
  /** How many Supabase nodes were pointed at this client's table. Reported so
   *  a template that stopped carrying chats nodes is visible, not silent. */
  let retargetedNodes = 0;
  if (existing) {
    workflowId = existing.id;
    adopted = true;
  } else {
    // The template is a copy of a real client's workflow, so its Postgres
    // nodes still point at that client's schema. Retarget them before
    // creating, or the new client's conversations land in someone else's
    // history. The chats step runs after this one, so chats_table is usually
    // still null here and the name is derived the same way that step derives it.
    const table = client.chats_table ?? chatsTableName(client.name);
    if (!table) {
      return {
        ok: false,
        error: "El nombre del cliente no produce un nombre de esquema válido: no se puede duplicar el flujo sin saber a qué esquema debe escribir.",
      };
    }
    const source = await getWorkflow(creds, template.workflowId);
    // A template still carrying Supabase nodes was never migrated off the old
    // chats project. Its copy would write where nothing reads, so refuse
    // instead of creating a flow that looks fine and loses every conversation.
    const legacy = countLegacySupabaseNodes(source);
    if (legacy > 0) {
      return {
        ok: false,
        error: `El flujo plantilla todavía tiene ${legacy} nodo(s) de Supabase. Actualízalo a nodos de Postgres antes de dar de alta clientes, o sus conversaciones se guardarán donde ya nadie las lee.`,
      };
    }
    const { workflow: retargetedWorkflow, retargeted } = retargetChatsTable(source, table);
    // 0 means the template has no conversation node at all: its shape changed.
    if (retargeted === 0) {
      return {
        ok: false,
        error: "El flujo plantilla no tiene ningún nodo de Postgres sobre la tabla chats: no se puede saber a qué esquema debe escribir el cliente nuevo. Revisa la plantilla.",
      };
    }
    const created = await createWorkflow(creds, { ...retargetedWorkflow, name: wanted });
    workflowId = String(created.id ?? "");
    if (!workflowId) {
      return { ok: false, error: "n8n creó el flujo pero no devolvió su id." };
    }
    retargetedNodes = retargeted;
  }

  const bindings = await listBindings(client.id);
  if (bindings.some((b) => b.mode === "api" && b.workflow_id === workflowId)) {
    return { ok: true, detail: `${wanted} (ya estaba vinculado)` };
  }

  // The copy is fresh, so read it back rather than trusting the POST echo.
  const agents = listAgentNodes(await getWorkflow(creds, workflowId));
  const agent = pickPromptAgent(agents);
  if (!agent) {
    if (agents.length === 0) {
      return {
        ok: false,
        error: `El flujo «${wanted}» ${adopted ? "ya existía y" : "se creó, pero"} no tiene ningún nodo AI Agent. Vincúlalo a mano desde la ficha.`,
      };
    }
    // More than one agent and none of them is unambiguously the prompt one.
    // Only the user knows which holds the client prompt, so `pick` carries the
    // COPY (never the template) and the UI reopens the picker on it.
    return {
      ok: false,
      error: `El flujo «${wanted}» ${adopted ? "ya existía y" : "se creó y"} tiene ${agents.length} nodos AI Agent. Elige cuál debe recibir el prompt.`,
      pick: { connectionId: template.connectionId, workflowId },
    };
  }

  await createApiBinding(client.id, {
    connection_id: template.connectionId,
    workflow_id: workflowId,
    workflow_name: wanted,
    node_id: agent.node_id,
    node_name: agent.node_name,
    expression_prefix: agent.expression_prefix,
  });
  return {
    ok: true,
    detail: adopted
      ? // An adopted flow was not retargeted (it may be an older copy still
        // pointing at the template's client), so say it instead of implying
        // the copy is clean.
        `${wanted} (flujo existente, vinculado; revisa a qué esquema de chats escribe)`
      : `${wanted} (duplicado y vinculado, ${retargetedNodes} nodo(s) reapuntados)`,
  };
}

/**
 * Creates the client's schema (with its `chats` table) and connects it. Adopts
 * the schema when it already exists (the agents may have created it first), and
 * the DDL is `if not exists` throughout, so this is safe to retry.
 */
async function ensureChatsTable(client: Client): Promise<StepResult> {
  const table = chatsTableName(client.name);
  if (!table) {
    return {
      ok: false,
      error: "El nombre del cliente no produce un nombre de esquema válido.",
    };
  }
  if (client.chats_table === table) {
    return { ok: true, detail: `${table} (ya estaba conectada)` };
  }
  if (!isChatsConfigured()) {
    return { ok: false, error: "La base de datos de chats no está configurada." };
  }

  const existing = (await listChatsTables()).some((t) => t.table === table);
  if (!existing) {
    if (!isChatsAdminConfigured()) {
      return { ok: false, error: "Falta configurar CHATS_DB_PASSWORD." };
    }
    await createChatsTable(table);
  }
  await updateClient(client.id, { chats_table: table });
  return { ok: true, detail: existing ? `${table} (esquema existente, conectado)` : `${table} (creado)` };
}

/**
 * Runs the requested steps. Throws only when the client does not exist; a step
 * failure comes back as `{ ok: false, error }` so the caller can report both
 * outcomes at once.
 */
export async function provisionClient(
  clientId: string,
  opts: ProvisionOptions,
): Promise<ProvisioningResult> {
  const client = await getClient(clientId);
  if (!client) throw new Error("Cliente no encontrado.");

  const result: ProvisioningResult = { workflow: null, chats: null };

  if (opts.duplicateWorkflow) {
    if (!opts.template) {
      result.workflow = {
        ok: false,
        error: "No hay flujo plantilla configurado. Elígelo en Ajustes, en la conexión de n8n.",
      };
    } else {
      try {
        result.workflow = await duplicateAndBind(client, opts.template);
      } catch (err) {
        result.workflow = { ok: false, error: errorText(err) };
      }
    }
  }

  if (opts.createChatsTable) {
    try {
      result.chats = await ensureChatsTable(client);
    } catch (err) {
      result.chats = { ok: false, error: errorText(err) };
    }
  }

  return result;
}

/**
 * Resolves which template to duplicate: an explicit override, else the default
 * stored on the connection. Returns null when neither yields one.
 */
export async function resolveTemplate(override?: {
  connectionId?: string;
  workflowId?: string;
}): Promise<{ connectionId: string; workflowId: string } | null> {
  if (override?.connectionId && override.workflowId) {
    return { connectionId: override.connectionId, workflowId: override.workflowId };
  }
  if (override?.connectionId) {
    const conn = await getConnection(override.connectionId);
    return conn?.template_workflow_id
      ? { connectionId: conn.id, workflowId: conn.template_workflow_id }
      : null;
  }
  const withTemplate = (await listConnectionsWithTemplate())[0];
  return withTemplate ?? null;
}

/** Connections that have a template configured, in creation order. */
export async function listConnectionsWithTemplate(): Promise<
  { connectionId: string; workflowId: string; connectionName: string; workflowName: string | null }[]
> {
  return (await listConnections())
    .filter((c) => c.template_workflow_id)
    .map((c) => ({
      connectionId: c.id,
      workflowId: c.template_workflow_id as string,
      connectionName: c.name,
      workflowName: c.template_workflow_name,
    }));
}

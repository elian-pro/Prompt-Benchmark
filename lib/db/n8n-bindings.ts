/**
 * Data access for n8n bindings: a client's deploy targets.
 *
 * mode='api'    → connection + workflow + AI Agent node (pushed on promote).
 * mode='manual' → a label only; the human deploys and confirms (Fase B).
 *
 * See docs/N8N-SYNC-PLAN.md sections 3 and 7.
 */
import { getSupabase } from "../supabase";

export type BindingMode = "api" | "manual";

export type N8nBinding = {
  id: string;
  client_id: string;
  mode: BindingMode;
  connection_id: string | null;
  connection_name: string | null;
  workflow_id: string | null;
  workflow_name: string | null;
  node_id: string | null;
  node_name: string | null;
  expression_prefix: boolean;
  last_pushed_hash: string | null;
  manual_label: string | null;
  sync_enabled: boolean;
  last_deployed_version_id: string | null;
  last_deployed_at: string | null;
  created_at: string;
};

const COLS =
  "id, client_id, mode, connection_id, workflow_id, workflow_name, node_id, node_name, " +
  "expression_prefix, last_pushed_hash, manual_label, sync_enabled, " +
  "last_deployed_version_id, last_deployed_at, created_at";

function toBinding(row: any): N8nBinding {
  return {
    id: row.id,
    client_id: row.client_id,
    mode: row.mode,
    connection_id: row.connection_id ?? null,
    connection_name: row.n8n_connections?.name ?? null,
    workflow_id: row.workflow_id ?? null,
    workflow_name: row.workflow_name ?? null,
    node_id: row.node_id ?? null,
    node_name: row.node_name ?? null,
    expression_prefix: !!row.expression_prefix,
    last_pushed_hash: row.last_pushed_hash ?? null,
    manual_label: row.manual_label ?? null,
    sync_enabled: !!row.sync_enabled,
    last_deployed_version_id: row.last_deployed_version_id ?? null,
    last_deployed_at: row.last_deployed_at ?? null,
    created_at: row.created_at,
  };
}

export async function listBindings(clientId: string): Promise<N8nBinding[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_bindings")
    .select(`${COLS}, n8n_connections(name)`)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron listar los vínculos n8n: ${error.message}`);
  return (data ?? []).map(toBinding);
}

export async function getBinding(id: string): Promise<N8nBinding | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_bindings")
    .select(`${COLS}, n8n_connections(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener el vínculo n8n: ${error.message}`);
  return data ? toBinding(data) : null;
}

export async function createApiBinding(
  clientId: string,
  input: {
    connection_id: string;
    workflow_id: string;
    workflow_name: string;
    node_id: string;
    node_name: string;
    expression_prefix?: boolean;
  },
): Promise<N8nBinding> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_bindings")
    .insert({
      client_id: clientId,
      mode: "api",
      connection_id: input.connection_id,
      workflow_id: input.workflow_id,
      workflow_name: input.workflow_name,
      node_id: input.node_id,
      node_name: input.node_name,
      expression_prefix: input.expression_prefix ?? false,
    })
    .select(`${COLS}, n8n_connections(name)`)
    .single();
  if (error) throw new Error(`No se pudo crear el vínculo n8n: ${error.message}`);
  return toBinding(data);
}

export async function deleteBinding(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("n8n_bindings").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el vínculo n8n: ${error.message}`);
}

/**
 * Records a successful deployment: which version is now live at this target
 * and the hash of the pushed text (for drift). Used by the sync engine (T6)
 * and the manual-confirm button (T7).
 */
export async function markBindingDeployed(
  id: string,
  input: { versionId: string; pushedHash?: string | null; deployedAt: string },
): Promise<void> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {
    last_deployed_version_id: input.versionId,
    last_deployed_at: input.deployedAt,
  };
  if (input.pushedHash !== undefined) patch.last_pushed_hash = input.pushedHash;
  const { error } = await sb.from("n8n_bindings").update(patch).eq("id", id);
  if (error) throw new Error(`No se pudo registrar el despliegue: ${error.message}`);
}

/** Refreshes the stored node id after a name-fallback re-location (T6). */
export async function updateBindingNode(
  id: string,
  input: { node_id: string; node_name: string },
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("n8n_bindings")
    .update({ node_id: input.node_id, node_name: input.node_name })
    .eq("id", id);
  if (error) throw new Error(`No se pudo actualizar el nodo del vínculo: ${error.message}`);
}

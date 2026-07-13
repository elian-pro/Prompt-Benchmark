/**
 * The n8n sync engine: reads a bound AI Agent node, previews the change, and
 * pushes a prompt into it. Server-side only (decrypts connection keys).
 *
 * Safety rules (see docs/N8N-SYNC-PLAN.md 7.2): n8n's PUT replaces the whole
 * workflow, so we read fresh, mutate only the systemMessage in memory, and PUT
 * immediately. A concurrent-edit guard compares the workflow versionId the
 * user saw in the diff against a fresh read before writing. Every push snapshots
 * the previous text for rollback and is recorded in n8n_sync_events.
 */
import { createHash } from "node:crypto";
import { getConnectionCreds } from "../db/n8n-connections";
import { markBindingDeployed, updateBindingNode, type N8nBinding } from "../db/n8n-bindings";
import { logSyncEvent } from "../db/n8n-sync-events";
import { getWorkflow, updateWorkflow } from "./client";
import {
  computePushWarnings,
  locateBoundAgent,
  rawSystemMessage,
  readSystemMessage,
  toRawSystemMessage,
  writeSystemMessage,
  type PushWarning,
} from "./agent-node";

export function hashSystemMessage(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type PreviewResult =
  | {
      ok: true;
      binding_id: string;
      workflow_name: string;
      node_name: string;
      matched_by: "id" | "name";
      current_text: string;
      next_text: string;
      warnings: PushWarning[];
      /** n8n's workflow versionId at read time, for the concurrent-edit guard. */
      workflow_version_id: string | null;
      unchanged: boolean;
    }
  | {
      ok: false;
      binding_id: string;
      workflow_name: string;
      node_name: string;
      reason: "not_found" | "not_agent" | "n8n_error";
      message: string;
    };

/**
 * Reads the bound node and describes what a push of `nextText` would change,
 * without writing anything. Feeds the confirmation diff modal.
 */
export async function previewPush(binding: N8nBinding, nextText: string): Promise<PreviewResult> {
  const base = {
    binding_id: binding.id,
    workflow_name: binding.workflow_name ?? "",
    node_name: binding.node_name ?? "",
  };
  if (binding.mode !== "api" || !binding.connection_id || !binding.workflow_id) {
    return { ...base, ok: false, reason: "n8n_error", message: "El vínculo no es de tipo API." };
  }
  try {
    const creds = await getConnectionCreds(binding.connection_id);
    const workflow = await getWorkflow(creds, binding.workflow_id);
    const located = locateBoundAgent(workflow, {
      node_id: binding.node_id!,
      node_name: binding.node_name,
    });
    if (!located.ok) {
      return {
        ...base,
        ok: false,
        reason: located.reason,
        message:
          located.reason === "not_found"
            ? "El nodo vinculado ya no existe en el flujo. Vuelve a vincular."
            : "El nodo vinculado ya no es un AI Agent. Vuelve a vincular.",
      };
    }
    const currentRaw = rawSystemMessage(located.node);
    const current = readSystemMessage(located.node);
    const warnings = computePushWarnings({
      currentRaw,
      nextText,
      expressionPrefix: binding.expression_prefix,
    });
    const nextRaw = toRawSystemMessage(nextText, binding.expression_prefix);
    return {
      ...base,
      ok: true,
      matched_by: located.matched_by,
      current_text: current.text,
      next_text: nextText,
      warnings,
      workflow_version_id: (workflow as any).versionId ?? null,
      unchanged: currentRaw === nextRaw,
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      reason: "n8n_error",
      message: err instanceof Error ? err.message : "No se pudo leer el flujo en n8n.",
    };
  }
}

export type DriftStatus = "synced" | "drifted" | "no_baseline" | "not_found" | "not_agent" | "unreachable";

export type DriftResult = {
  binding_id: string;
  status: DriftStatus;
  message?: string;
};

/**
 * Compares the node's live systemMessage hash against `last_pushed_hash` to
 * tell whether someone edited it by hand in n8n since the last push. Read-only.
 * `no_baseline` means the binding was created but never pushed yet (nothing
 * to compare against), which the UI shows as "Sin verificar" rather than an
 * error.
 */
export async function checkDrift(binding: N8nBinding): Promise<DriftResult> {
  if (binding.mode !== "api" || !binding.connection_id || !binding.workflow_id) {
    return { binding_id: binding.id, status: "unreachable", message: "El vínculo no es de tipo API." };
  }
  if (!binding.last_pushed_hash) {
    return { binding_id: binding.id, status: "no_baseline" };
  }
  try {
    const creds = await getConnectionCreds(binding.connection_id);
    const workflow = await getWorkflow(creds, binding.workflow_id);
    const located = locateBoundAgent(workflow, {
      node_id: binding.node_id!,
      node_name: binding.node_name,
    });
    if (!located.ok) {
      return {
        binding_id: binding.id,
        status: located.reason === "not_found" ? "not_found" : "not_agent",
      };
    }
    const liveHash = hashSystemMessage(rawSystemMessage(located.node));
    return {
      binding_id: binding.id,
      status: liveHash === binding.last_pushed_hash ? "synced" : "drifted",
    };
  } catch (err) {
    return {
      binding_id: binding.id,
      status: "unreachable",
      message: err instanceof Error ? err.message : "No se pudo leer el flujo en n8n.",
    };
  }
}

export type PushOutcome = {
  binding_id: string;
  status: "success" | "error";
  message?: string;
};

/**
 * Pushes `nextText` into the bound node. `expectedWorkflowVersionId`, when
 * provided, aborts if the workflow changed in n8n since the diff was shown.
 * Records the result (with the previous text for rollback) in the audit log.
 */
export async function pushBinding(
  binding: N8nBinding,
  version: { id: string; content: string },
  options: { expectedWorkflowVersionId?: string | null; nowIso: string } = { nowIso: "" },
): Promise<PushOutcome> {
  const fail = async (message: string): Promise<PushOutcome> => {
    await logSyncEvent({
      binding_id: binding.id,
      client_id: binding.client_id,
      version_id: version.id,
      action: "push",
      status: "error",
      error_message: message,
    });
    return { binding_id: binding.id, status: "error", message };
  };

  if (binding.mode !== "api" || !binding.connection_id || !binding.workflow_id) {
    return fail("El vínculo no es de tipo API.");
  }

  try {
    const creds = await getConnectionCreds(binding.connection_id);
    const workflow = await getWorkflow(creds, binding.workflow_id);

    if (
      options.expectedWorkflowVersionId != null &&
      (workflow as any).versionId != null &&
      (workflow as any).versionId !== options.expectedWorkflowVersionId
    ) {
      return fail("El flujo cambió en n8n mientras confirmabas. Revisa el diff y reintenta.");
    }

    const located = locateBoundAgent(workflow, {
      node_id: binding.node_id!,
      node_name: binding.node_name,
    });
    if (!located.ok) {
      return fail(
        located.reason === "not_found"
          ? "El nodo vinculado ya no existe en el flujo."
          : "El nodo vinculado ya no es un AI Agent.",
      );
    }

    const previousRaw = rawSystemMessage(located.node);
    const nextNode = writeSystemMessage(located.node, version.content, binding.expression_prefix);
    const nextRaw = toRawSystemMessage(version.content, binding.expression_prefix);

    // Replace only the target node; everything else is written back verbatim.
    workflow.nodes = workflow.nodes.map((n) => (n === located.node ? nextNode : n));
    await updateWorkflow(creds, binding.workflow_id, workflow);

    // If we matched by name (ids changed), refresh the stored id.
    if (located.matched_by === "name") {
      await updateBindingNode(binding.id, { node_id: located.node.id, node_name: located.node.name });
    }

    await markBindingDeployed(binding.id, {
      versionId: version.id,
      pushedHash: hashSystemMessage(nextRaw),
      deployedAt: options.nowIso,
    });

    await logSyncEvent({
      binding_id: binding.id,
      client_id: binding.client_id,
      version_id: version.id,
      action: "push",
      status: "success",
      previous_content: previousRaw,
      pushed_content: nextRaw,
    });

    return { binding_id: binding.id, status: "success" };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "No se pudo escribir en n8n.");
  }
}

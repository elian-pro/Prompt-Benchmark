"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { MaskedConnection } from "@/lib/db/n8n-connections";
import type { WorkflowListItem } from "@/lib/n8n/client";
import type { AgentNodeSummary } from "@/lib/n8n/agent-node";

export type BindingSelection = {
  connection_id: string;
  connection_name: string;
  workflow_id: string;
  workflow_name: string;
  node_id: string;
  node_name: string;
  expression_prefix: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen API target. The parent persists it. */
  onConfirm: (selection: BindingSelection) => Promise<void> | void;
  /** Called with a manual target's label. The parent persists it. */
  onConfirmManual: (label: string) => Promise<void> | void;
};

type Mode = "api" | "manual";

/**
 * Reusable binding picker with two modes:
 * - API: connection -> workflow -> AI Agent node (pushed automatically).
 * - Manual: a free-text label for a client's own n8n we cannot reach; the
 *   human deploys by hand and confirms from the client detail card.
 * Self-contained (fetches connections, workflows and agents on demand) so it
 * can be dropped into the client detail card and the new-client flow alike.
 */
export function N8nBindingModal({ open, onClose, onConfirm, onConfirmManual }: Props) {
  const [mode, setMode] = useState<Mode>("api");

  const [connections, setConnections] = useState<MaskedConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");

  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [workflowId, setWorkflowId] = useState("");

  const [agents, setAgents] = useState<AgentNodeSummary[]>([]);
  const [nodeId, setNodeId] = useState("");

  const [manualLabel, setManualLabel] = useState("");

  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load connections once when opened.
  useEffect(() => {
    if (!open) return;
    fetch("/api/integrations/n8n")
      .then((r) => r.json())
      .then((rows: MaskedConnection[]) => setConnections(rows))
      .catch(() => setError("No se pudieron cargar las conexiones n8n."));
  }, [open]);

  const loadWorkflows = useCallback(async (connId: string) => {
    setLoadingWorkflows(true);
    setError(null);
    setWorkflows([]);
    setWorkflowId("");
    setAgents([]);
    setNodeId("");
    try {
      const res = await fetch(`/api/integrations/n8n/${connId}/workflows`);
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudieron cargar los flujos.");
      setWorkflows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoadingWorkflows(false);
    }
  }, []);

  const loadAgents = useCallback(async (connId: string, wfId: string) => {
    setLoadingAgents(true);
    setError(null);
    setAgents([]);
    setNodeId("");
    try {
      const res = await fetch(`/api/integrations/n8n/${connId}/workflows/${encodeURIComponent(wfId)}/agents`);
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudieron cargar los agentes.");
      setAgents(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  function onPickConnection(connId: string) {
    setConnectionId(connId);
    if (connId) loadWorkflows(connId);
  }

  function onPickWorkflow(wfId: string) {
    setWorkflowId(wfId);
    if (wfId) loadAgents(connectionId, wfId);
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      if (mode === "manual") {
        const label = manualLabel.trim();
        if (!label) return;
        await onConfirmManual(label);
        onClose();
        return;
      }
      const connection = connections.find((c) => c.id === connectionId);
      const workflow = workflows.find((w) => w.id === workflowId);
      const agent = agents.find((a) => a.node_id === nodeId);
      if (!connection || !workflow || !agent) return;
      await onConfirm({
        connection_id: connection.id,
        connection_name: connection.name,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        node_id: agent.node_id,
        node_name: agent.node_name,
        expression_prefix: agent.expression_prefix,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el vínculo.");
    } finally {
      setSaving(false);
    }
  }

  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(workflowFilter.trim().toLowerCase()),
  );

  const canConfirm = mode === "manual" ? Boolean(manualLabel.trim()) : Boolean(nodeId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vincular con n8n"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={saving || !canConfirm}>
            {saving ? "Guardando…" : "Vincular"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Tipo de destino</label>
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-toggle-btn${mode === "api" ? " is-active" : ""}`}
            onClick={() => setMode("api")}
          >
            En un n8n conectado
          </button>
          <button
            type="button"
            className={`mode-toggle-btn${mode === "manual" ? " is-active" : ""}`}
            onClick={() => setMode("manual")}
          >
            En el n8n del cliente (sin acceso)
          </button>
        </div>
      </div>

      {mode === "manual" ? (
        <div className="field">
          <label className="field-label">Etiqueta</label>
          <input
            className="input"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder="n8n de Kuyabeh, flujo WhatsApp"
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            No hay push automático. Después de promover, copias el prompt y
            confirmas manualmente que ya lo pegaste en n8n.
          </p>
        </div>
      ) : connections.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No hay conexiones n8n. Agrega una en Configuración → Conexiones n8n.
        </p>
      ) : (
        <>
          <div className="field">
            <label className="field-label">Conexión</label>
            <select
              className="select"
              value={connectionId}
              onChange={(e) => onPickConnection(e.target.value)}
            >
              <option value="">Elige una conexión…</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {connectionId && (
            <div className="field">
              <label className="field-label">Flujo</label>
              {loadingWorkflows ? (
                <p className="muted" style={{ fontSize: 13 }}>Cargando flujos…</p>
              ) : (
                <>
                  <input
                    className="input"
                    placeholder="Buscar flujo por nombre…"
                    value={workflowFilter}
                    onChange={(e) => setWorkflowFilter(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <select
                    className="select"
                    value={workflowId}
                    onChange={(e) => onPickWorkflow(e.target.value)}
                  >
                    <option value="">Elige un flujo…</option>
                    {filteredWorkflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {w.active ? "" : " (inactivo)"}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          {workflowId && (
            <div className="field">
              <label className="field-label">Nodo AI Agent</label>
              {loadingAgents ? (
                <p className="muted" style={{ fontSize: 13 }}>Cargando agentes…</p>
              ) : agents.length === 0 ? (
                <p className="form-error">
                  Este flujo no tiene nodos AI Agent. Elige otro flujo.
                </p>
              ) : (
                <div className="agent-pick-list">
                  {agents.map((a) => (
                    <label
                      key={a.node_id}
                      className={`agent-pick${nodeId === a.node_id ? " is-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="agent-node"
                        checked={nodeId === a.node_id}
                        onChange={() => setNodeId(a.node_id)}
                      />
                      <span className="agent-pick-body">
                        <span className="agent-pick-name">{a.node_name}</span>
                        <span className="agent-pick-preview">
                          {a.preview || "(prompt vacío)"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

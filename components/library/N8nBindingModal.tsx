"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPlugConnected, IconSitemap } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableChip } from "@/components/ui/SearchableChip";
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
 * - API: connection -> workflow -> AI Agent node (pushed automatically). The
 *   node is chosen explicitly (a workflow can hold several AI Agents) and its
 *   stable n8n id is what the binding stores, so pushes always hit that node.
 * - Manual: a free-text label for a client's own n8n we cannot reach.
 * Self-contained (fetches connections, workflows and agents on demand).
 */
export function N8nBindingModal({ open, onClose, onConfirm, onConfirmManual }: Props) {
  const [mode, setMode] = useState<Mode>("api");

  const [connections, setConnections] = useState<MaskedConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");

  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [workflowId, setWorkflowId] = useState("");

  const [agents, setAgents] = useState<AgentNodeSummary[]>([]);
  const [nodeId, setNodeId] = useState("");

  const [manualLabel, setManualLabel] = useState("");

  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Load connections once when opened, and auto-select the first one (usually
  // the team's own "Zebra") so its workflows are ready without an extra click.
  useEffect(() => {
    if (!open) return;
    fetch("/api/integrations/n8n")
      .then((r) => r.json())
      .then((rows: MaskedConnection[]) => {
        setConnections(rows);
        if (rows.length > 0) {
          setConnectionId(rows[0].id);
          loadWorkflows(rows[0].id);
        }
      })
      .catch(() => setError("No se pudieron cargar las conexiones n8n."));
  }, [open, loadWorkflows]);

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
    setAgents([]);
    setNodeId("");
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
        <div className="chip-row">
          <button
            type="button"
            className={`chip${mode === "api" ? " active" : ""}`}
            onClick={() => setMode("api")}
          >
            En un n8n conectado
          </button>
          <button
            type="button"
            className={`chip${mode === "manual" ? " active" : ""}`}
            onClick={() => setMode("manual")}
          >
            n8n del cliente (sin acceso)
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
            <SearchableChip
              icon={<IconPlugConnected size={13} />}
              placeholder="Elige una conexión"
              searchPlaceholder="Buscar conexión…"
              items={connections.map((c) => ({ id: c.id, label: c.name, meta: c.base_url }))}
              value={connectionId}
              onChange={onPickConnection}
              emptyText="Sin conexiones."
            />
          </div>

          <div className="field">
            <label className="field-label">Flujo</label>
            <SearchableChip
              icon={<IconSitemap size={13} />}
              placeholder="Elige un flujo"
              searchPlaceholder="Buscar flujo por nombre…"
              items={workflows.map((w) => ({
                id: w.id,
                label: w.name,
                meta: w.active ? "Activo" : "Inactivo",
              }))}
              value={workflowId}
              onChange={onPickWorkflow}
              loading={loadingWorkflows}
              emptyText="No se encontraron flujos."
              disabled={!connectionId}
            />
          </div>

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
                <>
                  <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    Elige el nodo cuyo prompt debe actualizarse. Se guarda su id,
                    así que la app siempre escribe en ese nodo exacto.
                  </p>
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
                          <span className="agent-pick-id">id: {a.node_id}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

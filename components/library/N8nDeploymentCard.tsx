"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPlus, IconTrash, IconPlugConnected, IconCopy, IconCheck } from "@tabler/icons-react";
import type { N8nBinding } from "@/lib/db/n8n-bindings";
import { Button } from "@/components/ui/Button";
import { N8nBindingModal, type BindingSelection } from "./N8nBindingModal";

type ProductionVersion = { id: string; version_number: string; content: string } | null;

type Props = {
  clientId: string;
  productionVersion: ProductionVersion;
};

/**
 * "Despliegue n8n" card in the client detail sidebar: lists the client's
 * deploy targets (API and manual) and lets the user bind a new one.
 * Self-contained (fetches its own bindings) to keep the big client detail
 * page lean. Manual targets show a pending-deploy reminder that compares
 * `last_deployed_version_id` against the client's current production version.
 */
export function N8nDeploymentCard({ clientId, productionVersion }: Props) {
  const [bindings, setBindings] = useState<N8nBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Opened straight from creation/import with ?bind=1: auto-open the picker
  // once, then strip the param so a refresh doesn't reopen it. Reading
  // window.location avoids the Suspense boundary useSearchParams would require.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("bind") === "1") {
      setModalOpen(true);
      url.searchParams.delete("bind");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/n8n-bindings`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar los vínculos.");
      setBindings(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createBinding(selection: BindingSelection) {
    const res = await fetch(`/api/clients/${clientId}/n8n-bindings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connection_id: selection.connection_id,
        workflow_id: selection.workflow_id,
        workflow_name: selection.workflow_name,
        node_id: selection.node_id,
        node_name: selection.node_name,
        expression_prefix: selection.expression_prefix,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo guardar el vínculo.");
    }
    await load();
  }

  async function createManualBinding(label: string) {
    const res = await fetch(`/api/clients/${clientId}/n8n-bindings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual", manual_label: label }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo guardar el vínculo.");
    }
    await load();
  }

  async function removeBinding(id: string) {
    const res = await fetch(`/api/clients/${clientId}/n8n-bindings/${id}`, {
      method: "DELETE",
    });
    if (res.ok) load();
  }

  async function copyProductionPrompt(bindingId: string) {
    if (!productionVersion) return;
    await navigator.clipboard.writeText(productionVersion.content);
    setCopiedId(bindingId);
    window.setTimeout(() => setCopiedId((v) => (v === bindingId ? null : v)), 1800);
  }

  async function confirmManualDeploy(bindingId: string) {
    if (!productionVersion) return;
    setConfirmingId(bindingId);
    try {
      const res = await fetch(`/api/clients/${clientId}/n8n-bindings/${bindingId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: productionVersion.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo confirmar el despliegue.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setConfirmingId(null);
    }
  }

  function isPending(b: N8nBinding): boolean {
    if (b.mode !== "manual" || !productionVersion) return false;
    return b.last_deployed_version_id !== productionVersion.id;
  }

  return (
    <div className="n8n-card">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <p className="section-label" style={{ margin: 0 }}>
          Despliegue n8n
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={<IconPlus size={13} />}
          onClick={() => setModalOpen(true)}
        >
          Vincular
        </Button>
      </div>

      {loading && <p className="muted" style={{ fontSize: 13 }}>Cargando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && bindings.length === 0 && (
        <div className="n8n-empty">
          <IconPlugConnected size={20} stroke={1.5} className="muted" />
          <span className="muted" style={{ fontSize: 13 }}>
            Sin vínculos. Al promover, este cliente no actualiza ningún nodo.
          </span>
        </div>
      )}

      {bindings.map((b) => {
        const pending = isPending(b);
        return (
          <div key={b.id} className="n8n-binding">
            <div className="row-between">
              <div className="n8n-binding-body">
                <span className="n8n-binding-node">
                  {b.mode === "manual" ? b.manual_label : b.node_name}
                </span>
                <span className="n8n-binding-meta">
                  {b.mode === "manual"
                    ? "Manual"
                    : `${b.workflow_name}${b.connection_name ? ` · ${b.connection_name}` : ""}`}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconTrash size={13} />}
                onClick={() => removeBinding(b.id)}
              >
                Quitar
              </Button>
            </div>

            {b.mode === "manual" && (
              <div className="n8n-manual-status">
                {pending ? (
                  <>
                    <span className="sync-warn" style={{ marginTop: 0 }}>
                      Pendiente de actualizar
                      {productionVersion ? ` (producción es ${productionVersion.version_number})` : ""}
                    </span>
                    <div className="n8n-manual-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={copiedId === b.id ? <IconCheck size={13} /> : <IconCopy size={13} />}
                        disabled={!productionVersion}
                        onClick={() => copyProductionPrompt(b.id)}
                      >
                        {copiedId === b.id ? "Copiado" : "Copiar prompt"}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!productionVersion || confirmingId === b.id}
                        onClick={() => confirmManualDeploy(b.id)}
                      >
                        {confirmingId === b.id ? "Confirmando…" : "Marcar como actualizado"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <span className="sync-ok" style={{ fontSize: 12 }}>
                    <IconCheck size={13} /> Actualizado
                    {b.last_deployed_at
                      ? ` · ${new Date(b.last_deployed_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`
                      : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {modalOpen && (
        <N8nBindingModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onConfirm={createBinding}
          onConfirmManual={createManualBinding}
        />
      )}
    </div>
  );
}

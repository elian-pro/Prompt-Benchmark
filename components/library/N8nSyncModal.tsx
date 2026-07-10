"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { PushWarning } from "@/lib/n8n/agent-node";

type Preview =
  | {
      ok: true;
      binding_id: string;
      workflow_name: string;
      node_name: string;
      matched_by: "id" | "name";
      current_text: string;
      next_text: string;
      warnings: PushWarning[];
      workflow_version_id: string | null;
      unchanged: boolean;
    }
  | {
      ok: false;
      binding_id: string;
      workflow_name: string;
      node_name: string;
      reason: string;
      message: string;
    };

type Outcome = { binding_id: string; status: "success" | "error"; message?: string };

const WARNING_COPY: Record<PushWarning, string> = {
  drops_interpolation:
    "El nodo interpola datos con {{ }} y el prompt nuevo no los incluye: se perdería esa inyección.",
  new_braces_evaluated:
    "El prompt nuevo contiene {{ }} y el campo es una expresión: n8n intentará evaluarlos.",
};

type Props = {
  clientId: string;
  versionId: string;
  versionNumber: string;
  onClose: () => void;
  onDone: (summary: { pushed: number; failed: number }) => void;
};

/**
 * Shown after a version is promoted: previews the change against each API
 * binding and pushes the prompt into n8n on confirmation. The DB promotion
 * already happened, so this modal only drives the deploy side.
 */
export function N8nSyncModal({ clientId, versionId, versionNumber, onClose, onDone }: Props) {
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/n8n-sync/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo leer n8n.");
      const rows: Preview[] = await res.json();
      setPreviews(rows);
      // Default-select pushable targets that actually change.
      setSelected(
        Object.fromEntries(
          rows.filter((p) => p.ok && !p.unchanged).map((p) => [p.binding_id, true]),
        ),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, [clientId, versionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePush() {
    if (!previews) return;
    const targets = previews
      .filter((p): p is Extract<Preview, { ok: true }> => p.ok && !!selected[p.binding_id])
      .map((p) => ({
        binding_id: p.binding_id,
        expected_workflow_version_id: p.workflow_version_id,
      }));
    if (targets.length === 0) {
      onDone({ pushed: 0, failed: 0 });
      onClose();
      return;
    }
    setPushing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/n8n-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, targets }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo sincronizar.");
      const results: Outcome[] = await res.json();
      setOutcomes(results);
      const pushed = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "error").length;
      // If everything succeeded, close right away; otherwise keep the modal
      // open so the user sees which targets failed.
      if (failed === 0) {
        onDone({ pushed, failed });
        onClose();
      } else {
        onDone({ pushed, failed });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setPushing(false);
    }
  }

  const selectableCount = previews?.filter((p) => p.ok && selected[p.binding_id]).length ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sincronizar ${versionNumber} con n8n`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pushing}>
            {outcomes ? "Cerrar" : "Ahora no"}
          </Button>
          {!outcomes && (
            <Button
              variant="primary"
              onClick={handlePush}
              disabled={pushing || !previews || selectableCount === 0}
            >
              {pushing ? "Sincronizando…" : `Sincronizar ${selectableCount || ""}`.trim()}
            </Button>
          )}
        </>
      }
    >
      {!previews && !loadError && (
        <p className="muted" style={{ fontSize: 13 }}>Leyendo el estado en n8n…</p>
      )}
      {loadError && <p className="form-error">{loadError}</p>}

      {previews && previews.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          Este cliente no tiene vínculos n8n de tipo API.
        </p>
      )}

      <div className="n8n-sync-list">
        {previews?.map((p) => {
          const outcome = outcomes?.find((o) => o.binding_id === p.binding_id);
          return (
            <div key={p.binding_id} className="n8n-sync-item">
              <div className="row-between">
                <div className="n8n-binding-body">
                  <span className="n8n-binding-node">{p.node_name}</span>
                  <span className="n8n-binding-meta">{p.workflow_name}</span>
                </div>
                {p.ok && !outcome && (
                  <label className="switch-inline">
                    <input
                      type="checkbox"
                      checked={!!selected[p.binding_id]}
                      disabled={p.unchanged}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [p.binding_id]: e.target.checked }))
                      }
                    />
                    <span>{p.unchanged ? "Sin cambios" : "Incluir"}</span>
                  </label>
                )}
                {outcome && (
                  <span className={outcome.status === "success" ? "sync-ok" : "sync-err"}>
                    {outcome.status === "success" ? (
                      <><IconCheck size={14} /> Sincronizado</>
                    ) : (
                      <><IconX size={14} /> Falló</>
                    )}
                  </span>
                )}
              </div>

              {!p.ok && <p className="form-error">{p.message}</p>}
              {outcome?.status === "error" && <p className="form-error">{outcome.message}</p>}

              {p.ok && p.matched_by === "name" && (
                <p className="sync-note">
                  El nodo se localizó por nombre (su id cambió). Se actualizará el vínculo.
                </p>
              )}

              {p.ok &&
                p.warnings.map((w) => (
                  <p key={w} className="sync-warn">
                    <IconAlertTriangle size={14} /> {WARNING_COPY[w]}
                  </p>
                ))}

              {p.ok && !p.unchanged && !outcome && (
                <details className="sync-diff">
                  <summary>Ver cambio</summary>
                  <div className="sync-diff-block">
                    <span className="sync-diff-label">Actual en n8n</span>
                    <pre>{p.current_text || "(vacío)"}</pre>
                  </div>
                  <div className="sync-diff-block">
                    <span className="sync-diff-label">Se enviará</span>
                    <pre>{p.next_text}</pre>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

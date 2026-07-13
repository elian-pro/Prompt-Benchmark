"use client";

import { useCallback, useEffect, useState } from "react";
import { IconChevronDown, IconChevronRight, IconHistory } from "@tabler/icons-react";
import type { SyncEvent } from "@/lib/db/n8n-sync-events";
import { Button } from "@/components/ui/Button";

type Props = {
  clientId: string;
};

const ACTION_LABELS: Record<SyncEvent["action"], string> = {
  push: "Push",
  rollback: "Reversión",
  drift_detected: "Drift detectado",
  manual_confirm: "Confirmación manual",
};

/**
 * Collapsible "Sincronizaciones" panel in the client detail sidebar: the
 * n8n_sync_events audit log, newest first, with a "Revertir" action on
 * successful pushes (writes the event's previous_content back into the node).
 */
export function N8nSyncHistory({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<SyncEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/n8n-sync/history`);
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cargar el historial.");
      setEvents(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, [clientId]);

  useEffect(() => {
    if (open && events === null) load();
  }, [open, events, load]);

  async function revert(eventId: string) {
    setRevertingId(eventId);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/n8n-sync/${eventId}/revert`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo revertir.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div className="n8n-card">
      <button className="n8n-history-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        <IconHistory size={14} />
        <span>Sincronizaciones</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {error && <p className="form-error">{error}</p>}
          {events === null && !error && (
            <p className="muted" style={{ fontSize: 13 }}>Cargando…</p>
          )}
          {events?.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>Sin eventos todavía.</p>
          )}
          {events?.map((e) => (
            <div key={e.id} className="n8n-history-item">
              <div className="row-between">
                <span className={e.status === "success" ? "sync-ok" : "sync-err"}>
                  {ACTION_LABELS[e.action]}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>
                  {new Date(e.created_at).toLocaleString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {e.error_message && <p className="form-error">{e.error_message}</p>}
              {e.action === "push" && e.status === "success" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revertingId === e.id}
                  onClick={() => revert(e.id)}
                >
                  {revertingId === e.id ? "Revirtiendo…" : "Revertir"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

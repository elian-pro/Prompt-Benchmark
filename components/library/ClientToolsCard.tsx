"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconPlus,
  IconTrash,
  IconTool,
  IconPencil,
  IconToggleLeft,
  IconToggleRight,
} from "@tabler/icons-react";
import type { MaskedTool } from "@/lib/db/client-tools";
import { Button } from "@/components/ui/Button";
import { ClientToolModal } from "./ClientToolModal";

/**
 * "Herramientas" card in the client detail sidebar: the HTTP tools the bot
 * under test may call, the same ones the client's agent calls in n8n. They
 * belong to the client and not to a conversation, so they are set up once here
 * and every Playground session and demo link picks them up.
 *
 * Self-contained (fetches its own rows) like the n8n deployment card.
 */
export function ClientToolsCard({ clientId }: { clientId: string }) {
  const [tools, setTools] = useState<MaskedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MaskedTool | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/tools`);
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Error al cargar las herramientas.");
      }
      setTools(await res.json());
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

  async function toggle(tool: MaskedTool) {
    try {
      const res = await fetch(`/api/clients/${clientId}/tools/${tool.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !tool.enabled }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "No se pudo cambiar la herramienta.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }

  async function remove(tool: MaskedTool) {
    if (!window.confirm(`¿Eliminar la herramienta "${tool.name}"?`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/tools/${tool.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "No se pudo eliminar la herramienta.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }

  /** Just the host: the full RPC path repeats the tool's own name and only
   *  pushes it out of the row. */
  function hostOf(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  return (
    <div className="n8n-card">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <p className="section-label" style={{ margin: 0 }}>
          Herramientas
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={<IconPlus size={13} />}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          Añadir
        </Button>
      </div>

      {loading && <p className="muted" style={{ fontSize: 13 }}>Cargando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && tools.length === 0 && (
        <div className="n8n-empty">
          <IconTool size={20} stroke={1.5} className="muted" />
          <span className="muted" style={{ fontSize: 13 }}>
            Sin herramientas. El bot de prueba responde solo con su prompt, sin consultar datos.
          </span>
        </div>
      )}

      {tools.map((t) => (
        <div key={t.id} className={`n8n-binding${t.enabled ? "" : " is-off"}`}>
          <div className="row-between">
            <div className="n8n-binding-body">
              <span className="n8n-binding-node">{t.name}</span>
              <span className="n8n-binding-meta">{hostOf(t.url)}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <Button
                size="sm"
                variant="ghost"
                icon={t.enabled ? <IconToggleRight size={15} /> : <IconToggleLeft size={15} />}
                onClick={() => toggle(t)}
                title={t.enabled ? "Desactivar" : "Activar"}
                aria-label={t.enabled ? `Desactivar ${t.name}` : `Activar ${t.name}`}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<IconPencil size={13} />}
                onClick={() => {
                  setEditing(t);
                  setModalOpen(true);
                }}
                aria-label={`Editar ${t.name}`}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<IconTrash size={13} />}
                onClick={() => remove(t)}
                aria-label={`Eliminar ${t.name}`}
              />
            </div>
          </div>
          <span className="n8n-binding-meta">
            {t.params.length === 0
              ? "Sin parámetros"
              : `Parámetros: ${t.params.map((p) => p.name).join(", ")}`}
          </span>
        </div>
      ))}

      <ClientToolModal
        open={modalOpen}
        clientId={clientId}
        tool={editing}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </div>
  );
}

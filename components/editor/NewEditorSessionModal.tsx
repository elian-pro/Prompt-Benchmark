"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Picks a client and opens a fresh Editor session against its current prompt
 * (production version, or the latest version when there's no production one).
 */
export function NewEditorSessionModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/clients?filter=all")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
        return res.json();
      })
      .then((data: ClientSummary[]) => setClients(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar los clientes."))
      .finally(() => setLoading(false));
  }, [open]);

  async function submit() {
    if (!clientId) return;
    setCreating(true);
    setError(null);
    try {
      // Resolve the base version: production if any, else the latest.
      const detailRes = await fetch(`/api/clients/${clientId}`);
      if (!detailRes.ok) {
        throw new Error((await detailRes.json()).error ?? "No se pudo cargar el cliente.");
      }
      const detail: ClientDetail = await detailRes.json();
      const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
      if (!baseVersionId) throw new Error("El cliente no tiene ninguna versión base.");

      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, baseVersionId }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "No se pudo crear la sesión.");
      }
      const session = await res.json();
      router.push(`/editor/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva edición"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={creating || !clientId}>
            {creating ? "Abriendo…" : "Abrir edición"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Cliente</label>
        {loading ? (
          <p className="empty-hint">Cargando clientes…</p>
        ) : (
          <select
            className="select"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Selecciona un cliente…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.production_version_number ? ` · ${c.production_version_number}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

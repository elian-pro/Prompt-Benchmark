"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Picks an existing prompt from the Library to use as the architectural
 * reference (structure only) and opens a fresh, client-less Creator session
 * against it. The client itself is created when the session is finalized.
 */
export function NewCreatorSessionModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [referenceId, setReferenceId] = useState("");
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
    if (!referenceId) return;
    setCreating(true);
    setError(null);
    try {
      // Resolve the reference version: production if any, else the latest.
      const detailRes = await fetch(`/api/clients/${referenceId}`);
      if (!detailRes.ok) {
        throw new Error((await detailRes.json()).error ?? "No se pudo cargar el cliente.");
      }
      const detail: ClientDetail = await detailRes.json();
      const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
      if (!baseVersionId) throw new Error("El prompt de referencia no tiene ninguna versión.");

      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "creator",
          baseVersionId,
          title: `Basado en ${detail.name}`,
        }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "No se pudo crear la sesión.");
      }
      const session = await res.json();
      router.push(`/creator/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva creación"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={creating || !referenceId}>
            {creating ? "Abriendo…" : "Abrir creación"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Prompt base (referencia de arquitectura)</label>
        {loading ? (
          <p className="empty-hint">Cargando clientes…</p>
        ) : (
          <select
            className="select"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
          >
            <option value="">Selecciona un prompt de referencia…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.production_version_number ? ` · ${c.production_version_number}` : ""}
              </option>
            ))}
          </select>
        )}
        <p className="field-hint">
          Se replica solo su arquitectura (estructura, flujo, formato). El
          contenido vendrá del brief que subas en la conversación.
        </p>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

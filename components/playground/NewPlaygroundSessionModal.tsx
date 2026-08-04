"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconGitBranch, IconTargetArrow } from "@tabler/icons-react";
import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import type { VersionListItem } from "@/lib/db/versions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableChip } from "@/components/ui/SearchableChip";

/**
 * Configures a new Playground session: pick the client + version to converse
 * with (defaults to production). On submit it creates the session and routes
 * to its conversation page.
 */
export function NewPlaygroundSessionModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
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

  // Load the chosen client's versions and default to production (else latest).
  useEffect(() => {
    if (!clientId) {
      setVersions([]);
      setVersionId("");
      return;
    }
    fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar el cliente.");
        return res.json();
      })
      .then((detail: ClientDetail) => {
        setVersions(detail.versions);
        setVersionId(detail.production_version?.id ?? detail.versions[0]?.id ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar las versiones."));
  }, [clientId]);

  async function submit() {
    if (!clientId || !versionId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          versionId,
          openingMessage: openingMessage.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo crear la conversación.");
      const session = await res.json();
      router.push(`/lab/playground/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva conversación"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={creating || !clientId || !versionId}
          >
            {creating ? "Creando…" : "Empezar a conversar"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Cliente</label>
        <SearchableChip
          icon={<IconTargetArrow size={13} />}
          placeholder="Selecciona un cliente"
          searchPlaceholder="Buscar cliente por nombre…"
          items={clients.map((c) => ({ id: c.id, label: c.name }))}
          value={clientId}
          onChange={setClientId}
          loading={loading}
          emptyText="No se encontraron clientes."
        />
      </div>

      {clientId && (
        <div className="field">
          <label className="field-label">Versión a probar</label>
          <SearchableChip
            icon={<IconGitBranch size={13} />}
            placeholder="Elige una versión"
            searchPlaceholder="Buscar versión…"
            items={versions.map((v) => ({
              id: v.id,
              label: v.version_number,
              meta: v.is_production ? "producción" : undefined,
            }))}
            value={versionId}
            onChange={setVersionId}
            emptyText="Sin versiones."
          />
        </div>
      )}

      <div className="field">
        <label className="field-label">Mensaje de inicio del bot (opcional)</label>
        <textarea
          className="textarea"
          rows={2}
          maxLength={2000}
          placeholder="Ej: ¡Hola! Soy el asistente de Vero Lozano. ¿En qué propiedad estás interesado?"
          value={openingMessage}
          onChange={(e) => setOpeningMessage(e.target.value)}
        />
        <p className="field-hint">
          Si lo llenas, el chat abre con este mensaje ya enviado por el bot, en vez de
          esperar a que tú escribas primero.
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

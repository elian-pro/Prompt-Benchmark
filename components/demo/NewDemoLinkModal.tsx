"use client";

import { useEffect, useState } from "react";
import { IconGitBranch, IconTargetArrow } from "@tabler/icons-react";

import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import type { VersionListItem } from "@/lib/db/versions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableChip } from "@/components/ui/SearchableChip";
import { businessDaysFrom, formatDeadlineEs, todayInMexico, WORKING_WEEK } from "@/lib/business-days";
import { DeadlinePicker } from "@/components/ui/DeadlinePicker";
import { resError } from "@/lib/res-error";

/**
 * Cuts a new demo link: a client, the version it freezes, and how the chat
 * opens. Same shape as the Playground's new session modal, since it is the same
 * decision, plus the caps that only matter once a URL is loose on the internet.
 */
export function NewDemoLinkModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [label, setLabel] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  /** A round is born with a deadline: leaving it open forever is the decision
   *  that has to be made on purpose, not the one that happens by default. */
  const [expiresOn, setExpiresOn] = useState<string | null>(() =>
    businessDaysFrom(todayInMexico(), WORKING_WEEK),
  );
  const [maxSessions, setMaxSessions] = useState("25");
  const [maxMessages, setMaxMessages] = useState("60");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/clients?filter=all")
      .then(async (res) => {
        if (!res.ok) throw new Error(await resError(res, "Error al cargar."));
        return res.json();
      })
      .then((data: ClientSummary[]) => setClients(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar los clientes."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!clientId) {
      setVersions([]);
      setVersionId("");
      return;
    }
    fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await resError(res, "Error al cargar el cliente."));
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
      const res = await fetch("/api/demo-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          versionId,
          label: label.trim() || undefined,
          openingMessage: openingMessage.trim() || undefined,
          maxSessions: Number(maxSessions) || undefined,
          maxMessages: Number(maxMessages) || undefined,
          expiresOn,
        }),
      });
      if (!res.ok) throw new Error(await resError(res, "No se pudo crear el link."));
      onCreated();
      onClose();
      setClientId("");
      setLabel("");
      setOpeningMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo link de pruebas"
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
            {creating ? "Creando…" : "Crear link"}
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
          <label className="field-label">Versión que va a probar</label>
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
          <p className="field-hint">
            El link queda congelado en esta versión. Si editas el prompt después, el cliente
            sigue probando la que le compartiste.
          </p>
        </div>
      )}

      <div className="field">
        <label className="field-label">¿Hasta cuándo puede dejar reportes?</label>
        <DeadlinePicker value={expiresOn} onChange={setExpiresOn} />
        {/* The hint is the client's own sentence, so what you pick and what
            they read are visibly the same thing. */}
        <p className="field-hint">
          {expiresOn
            ? `El cliente verá: "tienes hasta el ${formatDeadlineEs(expiresOn)} para dejar tus reportes".`
            : "Sin fecha, el link queda abierto hasta que lo cierres a mano."}
        </p>
      </div>

      <div className="field">
        <label className="field-label">Nombre de la ronda (opcional)</label>
        <input
          className="input"
          maxLength={120}
          placeholder="Ej: Primera ronda, agosto"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

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
          Si lo llenas, el chat abre con este mensaje ya enviado, en vez de esperar a que el
          cliente escriba primero.
        </p>
      </div>

      <div className="field demo-caps">
        <div>
          <label className="field-label">Máx. conversaciones</label>
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            value={maxSessions}
            onChange={(e) => setMaxSessions(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Máx. mensajes por persona</label>
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            value={maxMessages}
            onChange={(e) => setMaxMessages(e.target.value)}
          />
        </div>
      </div>
      <p className="field-hint">
        Topes duros. El link vive fuera del login, así que esto es lo que evita que una URL
        compartida de más se convierta en una factura.
      </p>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

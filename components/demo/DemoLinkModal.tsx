"use client";

import { useEffect, useState } from "react";
import { IconGitBranch, IconTargetArrow } from "@tabler/icons-react";

import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import type { DemoLink } from "@/lib/db/demo-links";
import type { VersionListItem } from "@/lib/db/versions";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableChip } from "@/components/ui/SearchableChip";
import { businessDaysFrom, formatDeadlineEs, todayInMexico, WORKING_WEEK } from "@/lib/business-days";
import { DeadlinePicker } from "@/components/ui/DeadlinePicker";
import { resError } from "@/lib/res-error";

type EditableLink = Pick<
  DemoLink,
  "id" | "label" | "opening_message" | "max_sessions" | "max_messages" | "expires_on"
>;

/**
 * Cuts a new demo link, or edits one already cut: a client, the version it
 * freezes, and how the chat opens. Same shape as the Playground's new session
 * modal, since it is the same decision, plus the caps that only matter once a
 * URL is loose on the internet.
 *
 * Editing (`link` given) hides the client and the version: both are frozen with
 * the link, so the client keeps testing what they were told they are testing.
 * The caller mounts the modal per edit, so the form starts from the link.
 */
export function DemoLinkModal({
  open,
  onClose,
  onSaved,
  link,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  link?: EditableLink;
}) {
  const editing = Boolean(link);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [label, setLabel] = useState(link?.label ?? "");
  const [openingMessage, setOpeningMessage] = useState(link?.opening_message ?? "");
  /** A round is born with a deadline: leaving it open forever is the decision
   *  that has to be made on purpose, not the one that happens by default. */
  const [expiresOn, setExpiresOn] = useState<string | null>(() =>
    link ? link.expires_on : businessDaysFrom(todayInMexico(), WORKING_WEEK),
  );
  const [maxSessions, setMaxSessions] = useState(String(link?.max_sessions ?? 25));
  const [maxMessages, setMaxMessages] = useState(String(link?.max_messages ?? 60));
  const [loading, setLoading] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || editing) return;
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
  }, [open, editing]);

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

  const canSave = !saving && (editing || (clientId !== "" && versionId !== ""));

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const settings = {
      maxSessions: Number(maxSessions) || undefined,
      maxMessages: Number(maxMessages) || undefined,
      expiresOn,
    };
    try {
      const res = link
        ? await fetch(`/api/demo-links/${link.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            // null, not undefined: emptying a field is an edit too.
            body: JSON.stringify({
              ...settings,
              label: label.trim() || null,
              openingMessage: openingMessage.trim() || null,
            }),
          })
        : await fetch("/api/demo-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...settings,
              clientId,
              versionId,
              label: label.trim() || undefined,
              openingMessage: openingMessage.trim() || undefined,
            }),
          });
      if (!res.ok) {
        throw new Error(
          await resError(res, editing ? "No se pudieron guardar los cambios." : "No se pudo crear el link."),
        );
      }
      onSaved();
      onClose();
      if (!editing) {
        setClientId("");
        setLabel("");
        setOpeningMessage("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar link de pruebas" : "Nuevo link de pruebas"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSave}>
            {editing
              ? saving
                ? "Guardando…"
                : "Guardar cambios"
              : saving
                ? "Creando…"
                : "Crear link"}
          </Button>
        </>
      }
    >
      {!editing && (
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
      )}

      {!editing && clientId && (
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
          {editing
            ? "Las conversaciones donde todavía no escriben abren con este mensaje. Las que ya empezaron lo verán si reinician el chat."
            : "Si lo llenas, el chat abre con este mensaje ya enviado, en vez de esperar a que el cliente escriba primero."}
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

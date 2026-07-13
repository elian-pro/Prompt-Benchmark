"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  IconArrowLeft,
  IconCopy,
  IconReplace,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import type { ClientDetail } from "@/lib/db/clients";
import type { VersionListItem } from "@/lib/db/versions";
import { computeNextNumber } from "@/lib/version-utils";
import { relativeTimeEs } from "@/lib/format";
import { isNewVersion } from "@/lib/badges";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FindReplace } from "@/components/ui/FindReplace";
import { SegmentPicker } from "@/components/library/SegmentPicker";
import { N8nDeploymentCard } from "@/components/library/N8nDeploymentCard";
import { N8nSyncModal } from "@/components/library/N8nSyncModal";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  editor_chat: "Editor",
  creator_chat: "Creator",
  imported: "Importado",
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Which version is being viewed on the right. `null` = the editable draft
  // (the manual editing surface, seeded from production). A version id = a
  // read-only view of that snapshot.
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  // What-changed note the user writes when finalizing a manual edit (optional).
  const [changeSummaryInput, setChangeSummaryInput] = useState("");
  // The version being promoted to production (opens the confirm modal).
  const [promoteTarget, setPromoteTarget] = useState<VersionListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VersionListItem | null>(null);
  // Opens the n8n sync modal after a promotion, when the client has bindings.
  const [syncTarget, setSyncTarget] = useState<
    { versionId: string; versionNumber: string; versionContent: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

  // Inline editing of a version's change summary (add it after a quick save).
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);

  // Inline editing of the client name and segment from the detail header.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingSegment, setEditingSegment] = useState(false);
  const [segmentDraft, setSegmentDraft] = useState("");
  const segmentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasEdited = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar el cliente.");
      const data: ClientDetail = await res.json();
      setDetail(data);
      hasEdited.current = false;
      setContent(data.draft_content ?? data.production_version?.content ?? "");
      // Default view: the draft editor if there's work in progress, otherwise
      // the latest version (read-only) — so opening a client shows its newest
      // prompt, not production, and every version is one click away.
      setSelectedVersionId(
        data.draft_content?.trim() ? null : (data.versions[0]?.id ?? null),
      );
      setAutosavedAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el cliente.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced autosave of the working draft (3s after the last keystroke).
  useEffect(() => {
    if (!detail || !hasEdited.current) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_content: content }),
        });
        if (res.ok) setAutosavedAt(new Date());
      } catch {
        // Silent — autosave retries on the next keystroke.
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [content, detail, id]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function copyProduction() {
    const text = detail?.production_version?.content;
    if (!text) {
      showToast("Este cliente no tiene versión de producción.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Prompt de producción copiado.");
    } catch {
      showToast("No se pudo copiar el prompt.");
    }
  }

  async function copyVersion(v: VersionListItem) {
    if (!v.content?.trim()) {
      showToast("Esta versión no tiene contenido.");
      return;
    }
    try {
      await navigator.clipboard.writeText(v.content);
      showToast(`Versión ${v.version_number} copiada.`);
    } catch {
      showToast("No se pudo copiar el prompt.");
    }
  }

  // Opens an "Editar con IA" session. Defaults to production (header button);
  // the version viewer passes an explicit id to edit from that snapshot.
  async function openEditorSession(versionId?: string) {
    if (!detail) return;
    const baseVersionId =
      versionId ?? detail.production_version?.id ?? detail.versions[0]?.id;
    if (!baseVersionId) {
      showToast("El cliente no tiene ninguna versión base.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id, baseVersionId }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "No se pudo abrir la edición.");
      }
      const session = await res.json();
      router.push(`/editor/${session.id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error inesperado.");
      setBusy(false);
    }
  }

  async function createVersion() {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          bumpType: "minor",
          source: "manual",
          changeSummary: changeSummaryInput.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo crear la versión.");
      }
      // Clear the draft now that it's committed as a version.
      await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_content: null }),
      });
      setFinalizeOpen(false);
      setPromoteTarget(null);
      setChangeSummaryInput("");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  // Promotion doesn't create a version: it only moves the "Producción" tag to
  // the chosen version (the one being viewed). The version number is unchanged.
  async function promoteVersion(v: VersionListItem) {
    setBusy(true);
    try {
      const res = await fetch(`/api/versions/${v.id}/promote`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo promover la versión.");
      }
      setPromoteTarget(null);
      await load();
      // Keep the just-promoted version in view (load() would default to latest).
      setSelectedVersionId(v.id);
      showToast(`${v.version_number} marcada como producción.`);
      // If the client has any n8n bindings (API or manual), offer to deploy now.
      try {
        const bRes = await fetch(`/api/clients/${id}/n8n-bindings`);
        if (bRes.ok) {
          const bindings: { mode: string; sync_enabled: boolean }[] = await bRes.json();
          if (bindings.some((b) => (b.mode === "api" && b.sync_enabled) || b.mode === "manual")) {
            setSyncTarget({ versionId: v.id, versionNumber: v.version_number, versionContent: v.content ?? "" });
          }
        }
      } catch {
        // Non-blocking: promotion already succeeded; sync can be retried later.
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  function startEditSummary(v: VersionListItem) {
    setEditingSummaryId(v.id);
    setSummaryDraft(v.change_summary ?? "");
  }
  function cancelEditSummary() {
    setEditingSummaryId(null);
    setSummaryDraft("");
  }
  // Save the change summary in place — no full reload, so the current version
  // view and selection stay put.
  async function saveSummary(v: VersionListItem) {
    setSavingSummary(true);
    try {
      const res = await fetch(`/api/versions/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary: summaryDraft.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar la descripción.");
      }
      const updated = await res.json();
      setDetail((d) =>
        d
          ? {
              ...d,
              versions: d.versions.map((x) =>
                x.id === v.id ? { ...x, change_summary: updated.change_summary } : x,
              ),
            }
          : d,
      );
      setEditingSummaryId(null);
      setSummaryDraft("");
      showToast("Descripción guardada.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSavingSummary(false);
    }
  }

  async function removeVersion(target: VersionListItem) {
    setBusy(true);
    try {
      const res = await fetch(`/api/versions/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar la versión.");
      }
      setDeleteTarget(null);
      await load();
      showToast(`Versión ${target.version_number} eliminada.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function patchClient(patch: Record<string, unknown>) {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo guardar el cambio.");
    }
    return res.json();
  }

  async function saveName() {
    if (!detail) return;
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === detail.name) {
      setNameDraft(detail.name);
      return;
    }
    try {
      await patchClient({ name: next });
      setDetail((d) => (d ? { ...d, name: next } : d));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar el nombre.");
      setNameDraft(detail.name);
    }
  }

  async function commitSegment(value: string) {
    if (!detail) return;
    const next = value.trim() || null;
    if (next === (detail.segment ?? null)) return;
    try {
      await patchClient({ segment: next });
      setDetail((d) => (d ? { ...d, segment: next } : d));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar el segmento.");
    }
  }

  // Debounce segment saves so free-text typing doesn't fire a request per key.
  function onSegmentChange(value: string) {
    setSegmentDraft(value);
    if (segmentTimer.current) clearTimeout(segmentTimer.current);
    segmentTimer.current = setTimeout(() => commitSegment(value), 700);
  }

  function finishSegment() {
    if (segmentTimer.current) clearTimeout(segmentTimer.current);
    void commitSegment(segmentDraft);
    setEditingSegment(false);
  }

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!detail) return <p className="empty-hint">Cliente no encontrado.</p>;

  const latestVersion = detail.versions[0] ?? null;
  const latestNumber = latestVersion?.version_number ?? "v1.0";
  const nextMinor = computeNextNumber(latestNumber, "minor");
  const prodLabel = detail.production_version?.version_number ?? "sin producción";
  const hasDraft = Boolean(detail.draft_content?.trim());
  // The version being viewed read-only, if any (null → the draft editor).
  const viewingVersion =
    selectedVersionId != null
      ? (detail.versions.find((v) => v.id === selectedVersionId) ?? null)
      : null;

  return (
    <div>
      <Link href="/library" className="back-link">
        <IconArrowLeft size={15} />
        Volver a la biblioteca
      </Link>

      <div className="detail-header">
        <div>
          {editingName ? (
            <input
              className="title-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveName();
                } else if (e.key === "Escape") {
                  setNameDraft(detail.name);
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <h1
              className="detail-title editable-text"
              title="Clic para editar el nombre"
              onClick={() => {
                setNameDraft(detail.name);
                setEditingName(true);
              }}
            >
              {detail.name}
            </h1>
          )}
          <div className="detail-sub">
            <span className="section-label">Producción: {prodLabel}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {relativeTimeEs(detail.updated_at)}
            </span>
          </div>
          {editingSegment ? (
            <div className="segment-edit">
              <SegmentPicker value={segmentDraft} onChange={onSegmentChange} />
              <button type="button" className="segment-save" onClick={finishSegment}>
                Listo
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="segment-chip-display"
              title="Clic para editar el segmento"
              onClick={() => {
                setSegmentDraft(detail.segment ?? "");
                setEditingSegment(true);
              }}
            >
              {detail.segment ? detail.segment : "Añadir segmento"}
            </button>
          )}
        </div>
        <div className="header-actions">
          <Button
            variant="secondary"
            icon={<IconSparkles size={14} />}
            onClick={() => openEditorSession()}
            disabled={busy}
          >
            Editar con IA
          </Button>
          <Button
            variant="secondary"
            icon={<IconCopy size={14} />}
            onClick={copyProduction}
          >
            Copiar versión de producción
          </Button>
        </div>
      </div>

      <div className="detail-layout">
        <aside>
          <p className="section-label" style={{ marginBottom: 12 }}>
            Versiones
          </p>
          <div className="version-list">
            <div
              role="button"
              tabIndex={0}
              className={`version-item version-item-btn${selectedVersionId === null ? " is-active" : ""}`}
              onClick={() => setSelectedVersionId(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedVersionId(null);
                }
              }}
            >
              <span className="vnum">
                Borrador
                <span className="vnum-tags">
                  {hasDraft && <Badge variant="new-version">Sin guardar</Badge>}
                </span>
              </span>
              <div className="vfoot">
                <span className="vmeta">En edición</span>
              </div>
            </div>

            {detail.versions.map((v, i) => {
              // Versions are newest-first, so the last entry is the original.
              const isFirstVersion = i === detail.versions.length - 1;
              return (
                <div
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  className={`version-item version-item-btn${v.is_production ? " is-prod" : ""}${selectedVersionId === v.id ? " is-active" : ""}`}
                  onClick={() => setSelectedVersionId(v.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedVersionId(v.id);
                    }
                  }}
                >
                  <span className="vnum">
                    {v.version_number}
                    <span className="vnum-tags">
                      {isNewVersion(v.bump_type, v.created_at) && (
                        <Badge variant="new-version">Nueva versión</Badge>
                      )}
                      {v.is_production && <span className="prod-tag">Prod</span>}
                    </span>
                  </span>
                  <div className="vfoot">
                    <span className="vmeta">
                      {SOURCE_LABELS[v.source ?? ""] ?? "-"} ·{" "}
                      {new Date(v.created_at).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    {!v.is_production && detail.versions.length > 1 && (
                      <button
                        className="icon-btn danger"
                        title="Eliminar versión"
                        aria-label={`Eliminar versión ${v.version_number}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(v);
                        }}
                      >
                        <IconTrash size={14} />
                      </button>
                    )}
                  </div>

                  {editingSummaryId === v.id ? (
                    <div
                      className="version-changes-edit"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <textarea
                        className="textarea"
                        value={summaryDraft}
                        autoFocus
                        rows={4}
                        onChange={(e) => setSummaryDraft(e.target.value)}
                        placeholder={"Ej:\n- Actualicé el precio mínimo a $15,000"}
                      />
                      <div className="version-changes-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditSummary}
                          disabled={savingSummary}
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => saveSummary(v)}
                          disabled={savingSummary}
                        >
                          {savingSummary ? "Guardando…" : "Guardar"}
                        </Button>
                      </div>
                    </div>
                  ) : v.change_summary ? (
                    <div className="version-changes-view">
                      <pre className="version-changes">{v.change_summary}</pre>
                      <button
                        type="button"
                        className="version-changes-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditSummary(v);
                        }}
                      >
                        Editar descripción
                      </button>
                    </div>
                  ) : isFirstVersion ? (
                    <div className="version-changes-view">
                      <p className="version-changes is-first">Primera versión</p>
                      <button
                        type="button"
                        className="version-changes-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditSummary(v);
                        }}
                      >
                        Agregar descripción
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="version-changes-link is-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditSummary(v);
                      }}
                    >
                      + Agregar descripción
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <N8nDeploymentCard
            clientId={id}
            productionVersion={
              detail.production_version
                ? {
                    id: detail.production_version.id,
                    version_number: detail.production_version.version_number,
                    content: detail.production_version.content,
                  }
                : null
            }
          />
        </aside>

        {viewingVersion ? (
          <section>
            <div className="version-view-head">
              <p className="editor-title" style={{ margin: 0 }}>
                Viendo {viewingVersion.version_number}
                {viewingVersion.is_production ? " · producción" : ""} ·{" "}
                {SOURCE_LABELS[viewingVersion.source ?? ""] ?? "-"}
              </p>
              <div className="version-view-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<IconCopy size={14} />}
                  onClick={() => copyVersion(viewingVersion)}
                >
                  Copiar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<IconSparkles size={14} />}
                  onClick={() => openEditorSession(viewingVersion.id)}
                  disabled={busy}
                >
                  Editar con IA
                </Button>
                {!viewingVersion.is_production && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setPromoteTarget(viewingVersion)}
                    disabled={busy}
                  >
                    Promover a producción
                  </Button>
                )}
              </div>
            </div>
            <pre className="version-view-content">
              {viewingVersion.content?.trim()
                ? viewingVersion.content
                : "(Esta versión no tiene contenido.)"}
            </pre>
          </section>
        ) : (
          <section>
            <div className="version-view-head">
              <p className="editor-title" style={{ margin: 0 }}>
                Borrador en edición
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={<IconReplace size={14} />}
                onClick={() => setFindOpen((v) => !v)}
              >
                Buscar y reemplazar
              </Button>
            </div>
            {findOpen && (
              <FindReplace
                textareaRef={editorTextareaRef}
                value={content}
                onChange={(next) => {
                  hasEdited.current = true;
                  setContent(next);
                }}
                onClose={() => setFindOpen(false)}
                onReplaceAll={(count) =>
                  showToast(`${count} ${count === 1 ? "reemplazo" : "reemplazos"} hechos.`)
                }
              />
            )}
            <textarea
              ref={editorTextareaRef}
              className="editor-textarea"
              value={content}
              onChange={(e) => {
                hasEdited.current = true;
                setContent(e.target.value);
              }}
              placeholder="Escribe o pega aquí el prompt del cliente…"
            />
            <div className="editor-meta">
              {autosavedAt &&
                `Autoguardado ${autosavedAt.toLocaleTimeString("es-MX")}`}
            </div>
            <div className="editor-actions">
              <Button variant="primary" onClick={() => setFinalizeOpen(true)}>
                Finalizar edición
              </Button>
            </div>
            <p className="field-hint" style={{ marginTop: 10 }}>
              Para promover una versión a producción, selecciónala en la lista y
              usa el botón «Promover a producción».
            </p>
          </section>
        )}
      </div>

      <Modal
        open={finalizeOpen}
        onClose={() => {
          if (busy) return;
          setFinalizeOpen(false);
          setChangeSummaryInput("");
        }}
        title={`¿Crear nueva versión ${nextMinor}?`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setFinalizeOpen(false);
                setChangeSummaryInput("");
              }}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button variant="primary" onClick={createVersion} disabled={busy}>
              {busy ? "Creando…" : `Crear ${nextMinor}`}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          Se guardará el borrador actual como una nueva versión menor {nextMinor}.
        </p>
        <div className="field" style={{ marginTop: 4 }}>
          <label className="field-label">
            ¿Qué cambios hiciste? <span className="field-optional">(opcional)</span>
          </label>
          <textarea
            className="textarea"
            value={changeSummaryInput}
            onChange={(e) => setChangeSummaryInput(e.target.value)}
            rows={4}
            placeholder={
              "Ej:\n- Actualicé el precio mínimo a $15,000\n- Agregué la objeción sobre tiempos de entrega"
            }
          />
          <p className="field-hint">
            Aparecerá bajo esta versión en la Biblioteca, para saber en qué se
            diferencia de la anterior.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(promoteTarget)}
        onClose={() => !busy && setPromoteTarget(null)}
        title={`¿Marcar ${promoteTarget?.version_number ?? ""} como producción?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromoteTarget(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => promoteTarget && promoteVersion(promoteTarget)}
              disabled={busy}
            >
              {busy ? "Promoviendo…" : `Promover ${promoteTarget?.version_number ?? ""}`}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          {promoteTarget?.version_number} recibirá la etiqueta de producción
          {detail.production_version
            ? ` (hoy la tiene ${prodLabel})`
            : ""}
          . El número de versión no cambia.
        </p>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        title={`¿Eliminar la versión ${deleteTarget?.version_number ?? ""}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && removeVersion(deleteTarget)}
              disabled={busy}
            >
              {busy ? "Eliminando…" : "Eliminar"}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          Se eliminará esta versión de forma permanente. Esta acción no se puede
          deshacer.
        </p>
      </Modal>

      {syncTarget && (
        <N8nSyncModal
          clientId={id}
          versionId={syncTarget.versionId}
          versionNumber={syncTarget.versionNumber}
          versionContent={syncTarget.versionContent}
          onClose={() => setSyncTarget(null)}
          onDone={({ pushed, failed }) => {
            if (pushed > 0 && failed === 0) showToast(`Sincronizado con n8n (${pushed}).`);
            else if (failed > 0) showToast(`Sincronización con ${failed} error(es).`);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { IconArrowLeft, IconCopy, IconSparkles, IconTrash } from "@tabler/icons-react";
import type { ClientDetail } from "@/lib/db/clients";
import type { VersionListItem } from "@/lib/db/versions";
import { computeNextNumber } from "@/lib/version-utils";
import { relativeTimeEs } from "@/lib/format";
import { isNewVersion } from "@/lib/badges";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

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
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VersionListItem | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function openEditorSession() {
    if (!detail) return;
    const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
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

  async function createVersion(bumpType: "minor" | "major") {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, bumpType, source: "manual" }),
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
      setPromoteOpen(false);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
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

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!detail) return <p className="empty-hint">Cliente no encontrado.</p>;

  const latestNumber = detail.versions[0]?.version_number ?? "v1.0";
  const nextMinor = computeNextNumber(latestNumber, "minor");
  const nextMajor = computeNextNumber(latestNumber, "major");
  const prodLabel = detail.production_version?.version_number ?? "sin producción";

  return (
    <div>
      <Link href="/library" className="back-link">
        <IconArrowLeft size={15} />
        Volver a la biblioteca
      </Link>

      <div className="detail-header">
        <div>
          <h1 className="detail-title">{detail.name}</h1>
          <div className="detail-sub">
            <span className="section-label">Producción: {prodLabel}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {relativeTimeEs(detail.updated_at)}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="secondary"
            icon={<IconSparkles size={14} />}
            onClick={openEditorSession}
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
            {detail.versions.map((v) => (
              <div
                key={v.id}
                className={`version-item${v.is_production ? " is-prod" : ""}`}
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
                    {SOURCE_LABELS[v.source ?? ""] ?? "—"} ·{" "}
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
                      onClick={() => setDeleteTarget(v)}
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section>
          <p className="editor-title">Editando draft basado en {latestNumber}</p>
          <textarea
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
            <Button variant="secondary" onClick={() => setPromoteOpen(true)}>
              Promover a producción
            </Button>
          </div>
        </section>
      </div>

      <Modal
        open={finalizeOpen}
        onClose={() => !busy && setFinalizeOpen(false)}
        title={`¿Crear nueva versión ${nextMinor}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinalizeOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => createVersion("minor")} disabled={busy}>
              {busy ? "Creando…" : `Crear ${nextMinor}`}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          Se guardará el draft actual como una nueva versión menor {nextMinor}.
        </p>
      </Modal>

      <Modal
        open={promoteOpen}
        onClose={() => !busy && setPromoteOpen(false)}
        title={`¿Promover a producción como ${nextMajor}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromoteOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => createVersion("major")} disabled={busy}>
              {busy ? "Promoviendo…" : `Promover ${nextMajor}`}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          Se creará la versión mayor {nextMajor} y se marcará como la versión de
          producción del cliente.
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

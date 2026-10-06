"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconCopy,
  IconCheck,
  IconLink,
  IconLock,
  IconLockOpen,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import type { DemoLinkListItem } from "@/lib/db/demo-links";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { formatDeadlineShortEs, isExpired } from "@/lib/business-days";
import { DemoLinkModal } from "@/components/demo/DemoLinkModal";
import { DemoTabs } from "@/components/demo/DemoTabs";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { resError } from "@/lib/res-error";

/**
 * Every demo link, newest first.
 *
 * The two numbers on each row are the ones that decide what to do next: how
 * many people used it, and how many of their reports are still waiting. A link
 * with pending notes is the reason to open this page at all.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DemoLinksPage() {
  const [links, setLinks] = useState<DemoLinkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DemoLinkListItem | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-links");
      if (!res.ok) throw new Error(await resError(res, "Error al cargar los links."));
      setLinks(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Asked here rather than on every page: this is where the user opts into
  // handing a link to a client, so it is the moment a "the client reported
  // something" notification starts making sense (same pattern as SessionChat).
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  async function copy(token: string) {
    const url = `${window.location.origin}/prueba/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      window.setTimeout(() => setCopied((cur) => (cur === token ? null : cur)), 2000);
    } catch {
      setError("No se pudo copiar. Copia la URL a mano: " + url);
    }
  }

  async function toggleStatus(link: DemoLinkListItem) {
    try {
      const res = await fetch(`/api/demo-links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: link.status === "active" ? "closed" : "active" }),
      });
      if (!res.ok) throw new Error(await resError(res, "No se pudo cambiar el link."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cambiar el link.");
    }
  }

  // Both throw on failure so DangerConfirmModal shows the error in place.
  async function deleteLink(link: DemoLinkListItem) {
    const res = await fetch(`/api/demo-links/${link.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await resError(res, "No se pudo eliminar el link."));
    setDeleteTarget(null);
    await load();
  }

  async function clearHistory() {
    const res = await fetch("/api/demo-links", { method: "DELETE" });
    if (!res.ok) throw new Error(await resError(res, "No se pudo vaciar el historial."));
    setClearOpen(false);
    await load();
  }

  const totalUnsent = links.reduce((n, l) => n + l.unsent_notes, 0);
  const totalPending = links.reduce((n, l) => n + l.pending_notes, 0);

  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Demo</h1>
          <p className="section-label library-subtitle">
            Links de prueba para que el cliente valide su agente
          </p>
        </div>
        <div className="header-actions">
          <DemoTabs current="links" />
          {links.length > 0 && (
            <Button
              variant="secondary"
              icon={<IconTrash size={14} />}
              onClick={() => setClearOpen(true)}
            >
              Vaciar historial
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => setNewOpen(true)}
            icon={<IconPlus size={14} stroke={1.5} />}
          >
            Nuevo link
          </Button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading && <SkeletonRows count={3} />}

      {!loading && links.length === 0 && (
        <EmptyState
          icon={<IconLink size={22} />}
          title="Todavía no hay links"
          description="Crea uno, mándaselo al cliente y sus conversaciones y reportes aparecen aquí."
        />
      )}

      <div className="demo-link-list">
        {links.map((link) => (
          <div key={link.id} className="demo-link-row">
            <Link href={`/lab/demo/${link.id}`} className="demo-link-main">
              <div className="demo-link-title">
                {link.client_name ?? "Cliente eliminado"}
                {link.label && <span className="demo-link-label">{link.label}</span>}
                {link.status === "closed" && <span className="note-status">Cerrado</span>}
                {/* Expired is not closed: nobody decided it, the date did. */}
                {link.status === "active" && isExpired(link.expires_on) && (
                  <span className="note-status">Vencido</span>
                )}
              </div>
              <div className="demo-link-meta">
                <span>v{link.version_number_snapshot}</span>
                <span>·</span>
                <span>
                  {link.session_count} conversación{link.session_count === 1 ? "" : "es"}
                </span>
                <span>·</span>
                <span>{formatDate(link.created_at)}</span>
                {link.expires_on && (
                  <>
                    <span>·</span>
                    <span>
                      {isExpired(link.expires_on) ? "venció" : "hasta"} el{" "}
                      {formatDeadlineShortEs(link.expires_on)}
                    </span>
                  </>
                )}
                {link.pending_notes > 0 && (
                  <span className="demo-link-pending">
                    {link.pending_notes} sin revisar
                  </span>
                )}
                {link.unsent_notes > 0 && (
                  <span className="demo-link-unsent">{link.unsent_notes} por enviar</span>
                )}
              </div>
            </Link>

            <div className="demo-link-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(link.token)}
                icon={
                  copied === link.token ? <IconCheck size={14} /> : <IconCopy size={14} />
                }
              >
                {copied === link.token ? "Copiado" : "Copiar link"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleStatus(link)}
                icon={
                  link.status === "active" ? <IconLock size={14} /> : <IconLockOpen size={14} />
                }
              >
                {link.status === "active" ? "Cerrar" : "Reabrir"}
              </Button>
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => setDeleteTarget(link)}
                aria-label={`Eliminar link de ${link.client_name ?? "cliente eliminado"}`}
                title="Eliminar link"
              >
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <DemoLinkModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={load} />

      {deleteTarget && (
        <DangerConfirmModal
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteLink(deleteTarget)}
          confirmTitle="¿Eliminar este link?"
          consequences={[
            deleteTarget.session_count === 1
              ? "Se borrará su conversación y sus reportes."
              : `Se borrarán sus ${deleteTarget.session_count} conversaciones y sus reportes.`,
            ...(deleteTarget.unsent_notes > 0
              ? [
                  deleteTarget.unsent_notes === 1
                    ? "1 reporte aprobado no se ha enviado al Editor y se perderá."
                    : `${deleteTarget.unsent_notes} reportes aprobados no se han enviado al Editor y se perderán.`,
                ]
              : []),
            "El cliente ya no podrá abrir el link.",
            "Esta acción no se puede deshacer.",
          ]}
        />
      )}

      {clearOpen && (
        <DangerConfirmModal
          onClose={() => setClearOpen(false)}
          onConfirm={clearHistory}
          confirmTitle="¿Vaciar todo el historial de Demo?"
          consequences={[
            links.length === 1
              ? "Se borrará el único link, con sus conversaciones y reportes."
              : `Se borrarán los ${links.length} links, con todas sus conversaciones y reportes.`,
            ...(totalUnsent + totalPending > 0
              ? [`Se perderán reportes que aún no llegan al Editor: ${totalPending} sin revisar y ${totalUnsent} aprobados sin enviar.`]
              : []),
            "Los clientes ya no podrán abrir ningún link.",
            "Esta acción no se puede deshacer.",
          ]}
          confirmPhrase="VACIAR"
          confirmLabel="Sí, vaciar"
          busyLabel="Vaciando…"
        />
      )}
    </div>
  );
}

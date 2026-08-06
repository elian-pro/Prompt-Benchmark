"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { IconArrowLeft, IconList, IconMessages, IconTrash } from "@tabler/icons-react";

import type { DemoLink, LinkSessionListItem } from "@/lib/db/demo-links";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDeadlineEs, isExpired } from "@/lib/business-days";
import { DeadlinePicker } from "@/components/ui/DeadlinePicker";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { DemoLinkWorkspace } from "@/components/demo/DemoLinkWorkspace";

type LinkDetail = Omit<DemoLink, "prompt_snapshot"> & {
  client_name: string | null;
  sessions: LinkSessionListItem[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Enough of the user agent to tell a phone from a laptop at a glance. The full
 *  string is kept in the database for when the exact device matters. */
function deviceOf(ua: string | null): string {
  if (!ua) return "Dispositivo desconocido";
  if (/iPhone|iPad/i.test(ua)) return "iPhone o iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Otro dispositivo";
}

/**
 * One link and everything that happened through it.
 *
 * Same two column shape as Replay, and for the same reason: finding the
 * conversation and reading it are different moments, so opening one folds the
 * list out of the way.
 */
export default function DemoLinkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const linkId = Array.isArray(params.linkId) ? params.linkId[0] : (params.linkId as string);

  const [detail, setDetail] = useState<LinkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/demo-links/${linkId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Link no encontrado.");
      setDetail(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el link.");
    }
  }, [linkId]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(sessionId: string) {
    setSelectedId(sessionId);
    setListOpen(false);
  }

  /** One field, one request: the deadline is a single decision and does not
   *  need a form around it. */
  async function saveExpiry(value: string | null) {
    const res = await fetch(`/api/demo-links/${linkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresOn: value }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo cambiar la fecha.");
      return;
    }
    await load();
  }

  async function removeLink() {
    const res = await fetch(`/api/demo-links/${linkId}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo eliminar el link.");
    router.push("/lab/demo");
  }

  const selected = detail?.sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div>
      <div className="library-header">
        <div>
          <Link href="/lab/demo" className="back-link">
            <IconArrowLeft size={14} /> Demo
          </Link>
          <h1 className="library-title">{detail?.client_name ?? "…"}</h1>
          <p className="section-label library-subtitle">
            {detail
              ? `v${detail.version_number_snapshot} · ${detail.sessions.length} conversación${
                  detail.sessions.length === 1 ? "" : "es"
                }${detail.label ? ` · ${detail.label}` : ""}${
                  detail.expires_on
                    ? ` · ${isExpired(detail.expires_on) ? "venció" : "hasta"} el ${formatDeadlineEs(detail.expires_on)}`
                    : ""
                }`
              : "Cargando…"}
          </p>
        </div>
        <div className="detail-actions">
          {detail && (
            <DeadlinePicker
              value={detail.expires_on}
              onChange={(next) => void saveExpiry(next)}
            />
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            icon={<IconTrash size={14} />}
          >
            Eliminar link
          </Button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {selected && (
        <div className="replay-toolbar">
          <Button variant="ghost" size="sm" onClick={() => setListOpen((v) => !v)}>
            <IconList size={15} />
            {listOpen ? "Ocultar conversaciones" : "Ver conversaciones"}
          </Button>
        </div>
      )}

      {detail && (
        <div className={`replay-layout${listOpen ? "" : " is-collapsed"}`}>
          <section className="replay-list" aria-hidden={!listOpen}>
            {detail.sessions.length === 0 ? (
              <EmptyState
                icon={<IconMessages size={22} />}
                title="Nadie ha abierto el link"
                description="En cuanto alguien entre y escriba, su conversación aparece aquí."
              />
            ) : (
              <div className="demo-session-list">
                {detail.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`demo-session-row${selectedId === s.id ? " is-selected" : ""}`}
                    onClick={() => open(s.id)}
                  >
                    <div className="demo-session-top">
                      <span>{formatDate(s.created_at)}</span>
                      {s.pending_notes > 0 && (
                        <span className="demo-link-pending">{s.pending_notes}</span>
                      )}
                    </div>
                    <div className="demo-session-meta">
                      {s.message_count} mensaje{s.message_count === 1 ? "" : "s"}
                      {s.round_count > 1 && ` · ${s.round_count} conversaciones`}
                      {s.note_count > 0 && ` · ${s.note_count} reporte${s.note_count === 1 ? "" : "s"}`}
                    </div>
                    {/* The evidence trail, visible without opening the row: this
                        is what answers "who said that, and from where". */}
                    <div className="demo-session-trace">
                      {deviceOf(s.visitor_user_agent)}
                      {s.visitor_ip ? ` · ${s.visitor_ip}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            {selectedId ? (
              <DemoLinkWorkspace linkId={linkId} sessionId={selectedId} onReviewed={load} />
            ) : (
              <EmptyState
                icon={<IconMessages size={22} />}
                title="Ninguna conversación abierta"
                description="Elige una de la lista para leer lo que probó el cliente y lo que reportó."
              />
            )}
          </section>
        </div>
      )}

      {deleteOpen && (
        <DangerConfirmModal
          onClose={() => setDeleteOpen(false)}
          onConfirm={removeLink}
          warning={{
            title: "¿Eliminar este link?",
            body: (
              <>
                Cerrarlo basta para que deje de funcionar y conserva todo lo que el cliente
                escribió. Eliminarlo borra también esa evidencia, y no se puede deshacer.
              </>
            ),
            secondary: {
              label: "Mejor cerrarlo",
              onAction: async () => {
                const res = await fetch(`/api/demo-links/${linkId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "closed" }),
                });
                if (!res.ok) throw new Error("No se pudo cerrar el link.");
                setDeleteOpen(false);
                await load();
              },
            },
          }}
          consequences={[
            `${detail?.sessions.length ?? 0} conversación(es) del cliente, con su fecha, IP y dispositivo`,
            "Todos los reportes que dejaron, aprobados o no",
            "La URL deja de existir y no se puede recuperar",
          ]}
          confirmPhrase={detail?.client_name ?? undefined}
        />
      )}
    </div>
  );
}

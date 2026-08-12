"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconNotes, IconUser } from "@tabler/icons-react";

import type { DemoNoteWithContext } from "@/lib/db/demo-notes";
import { messagePreview } from "@/lib/adversarial-message";
import { relativeTimeEs } from "@/lib/format";
import { DemoTabs } from "@/components/demo/DemoTabs";
import { NoteCard, type NoteReviewPatch } from "@/components/demo/NoteCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchableChip } from "@/components/ui/SearchableChip";
import { SkeletonRows } from "@/components/ui/Skeleton";

/**
 * Every report one client wrote, from every link and every conversation, in one
 * place.
 *
 * The reason this exists is that a verdict used to cost a navigation: open the
 * link, open the conversation, read the panel. Reports arrive across
 * conversations and often say the same thing twice, so deciding them one
 * conversation at a time also decided the size of the batch that reached the
 * Editor. Here the batch is the client's, and what leaves is everything
 * approved that has not left already.
 *
 * The transcript is deliberately not here. What a verdict needs is the tagged
 * turn, which every card quotes; when that is not enough, the conversation is
 * one link away.
 */
type ClientSummary = { id: string; name: string };

const FILTERS = [
  { key: "pending", label: "Sin revisar" },
  { key: "approved", label: "Aprobadas" },
  { key: "rejected", label: "Descartadas" },
  { key: "sent", label: "Enviadas" },
  { key: "all", label: "Todas" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

/** Which bucket a report is in. Sent wins over approved: it is no longer
 *  waiting on anything. */
function bucketOf(note: DemoNoteWithContext): Exclude<Filter, "all"> {
  if (note.sent_to_editor_at) return "sent";
  return note.status;
}

const LAST_CLIENT_KEY = "demo-notes:last-client";

export default function DemoNotesInboxPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState<DemoNoteWithContext[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(false);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients?filter=all")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
        return res.json();
      })
      .then((data: ClientSummary[]) => {
        setClients(data);
        // Reports come back over days, so the client you were reviewing
        // yesterday is almost always the one you open this page for today.
        const last = window.localStorage.getItem(LAST_CLIENT_KEY);
        if (last && data.some((c) => c.id === last)) setClientId(last);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar los clientes."));
  }, []);

  const load = useCallback(async () => {
    if (!clientId) {
      setNotes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/demo-notes`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar los reportes.");
      setNotes(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los reportes.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function pickClient(id: string) {
    setClientId(id);
    window.localStorage.setItem(LAST_CLIENT_KEY, id);
  }

  // Same PATCH the conversation panel uses: it authorizes by link, session and
  // note, and every row here knows all three.
  async function review(note: DemoNoteWithContext, patch: NoteReviewPatch) {
    if (!note.link_id) {
      setError("Este reporte no viene de un link: revísalo desde su conversación.");
      return;
    }
    setBusyNoteId(note.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/demo-links/${note.link_id}/sessions/${note.session_id}/notes/${note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar.");
      const updated = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...updated } : n)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la revisión.");
    } finally {
      setBusyNoteId(null);
    }
  }

  // Same handoff contract as everywhere else: the Editor session is created on
  // the server, the composed document crosses the navigation through
  // sessionStorage and lands in the composer without being sent.
  async function sendToEditor() {
    if (handingOff) return;
    setHandingOff(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/demo-notes/handoff`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo enviar al Editor.");
      const { editorSessionId, draftMessage } = await res.json();
      window.sessionStorage.setItem(`playground-handoff:${editorSessionId}`, draftMessage);
      router.push(`/editor/${editorSessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar al Editor.");
      setHandingOff(false);
    }
  }

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      sent: 0,
      all: notes.length,
    };
    for (const n of notes) base[bucketOf(n)] += 1;
    return base;
  }, [notes]);

  const displayed = useMemo(
    () => (filter === "all" ? notes : notes.filter((n) => bucketOf(n) === filter)),
    [notes, filter],
  );

  const clientName = clients.find((c) => c.id === clientId)?.name ?? null;

  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Cambios</h1>
          <p className="section-label library-subtitle">
            {clientName
              ? `Todo lo que ${clientName} reportó, de todas sus conversaciones`
              : "Todo lo que un cliente reportó, de todas sus conversaciones"}
          </p>
        </div>
        <DemoTabs current="cambios" />
      </div>

      <div className="library-toolbar">
        <SearchableChip
          icon={<IconUser size={13} />}
          placeholder="Elige un cliente"
          searchPlaceholder="Buscar cliente…"
          items={clients.map((c) => ({ id: c.id, label: c.name }))}
          value={clientId}
          onChange={pickClient}
        />
        {clientId && (
          <div className="filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="chip-count">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {!clientId && (
        <EmptyState
          icon={<IconNotes size={22} />}
          title="Elige un cliente"
          description="Sus reportes de todos los links y todas las conversaciones se leen aquí, juntos."
        />
      )}

      {clientId && loading && <SkeletonRows count={3} />}

      {clientId && !loading && notes.length === 0 && (
        <EmptyState
          icon={<IconNotes size={22} />}
          title="Sin reportes"
          description="Este cliente todavía no reporta nada en sus links de prueba."
        />
      )}

      {clientId && !loading && notes.length > 0 && displayed.length === 0 && (
        <p className="empty-hint">Nada con este filtro.</p>
      )}

      <div className="notes-inbox-list">
        {displayed.map((note, i) => (
          <NoteCard
            key={note.id}
            note={note}
            index={i + 1}
            quotes={note.messages.map((m) => ({ id: m.id, preview: messagePreview(m.content) }))}
            busy={busyNoteId === note.id}
            onReview={(patch) => review(note, patch)}
            footer={
              <div className="demo-link-meta">
                {note.link_id ? (
                  <Link href={`/lab/demo/${note.link_id}`}>
                    {note.link_label ?? "Link sin nombre"}
                  </Link>
                ) : (
                  <span>Conversación sin link</span>
                )}
                {note.version_number && (
                  <>
                    <span>·</span>
                    <span>v{note.version_number}</span>
                  </>
                )}
                <span>·</span>
                <span>{relativeTimeEs(note.created_at)}</span>
              </div>
            }
          />
        ))}
      </div>

      {counts.approved > 0 && (
        <div className="notes-send-bar">
          <Button
            variant="primary"
            onClick={sendToEditor}
            disabled={handingOff}
            icon={<IconArrowRight size={14} />}
          >
            {handingOff ? "Abriendo el Editor…" : `Enviar ${counts.approved} al Editor`}
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { IconNotes } from "@tabler/icons-react";

import type { DemoSessionDetail } from "@/lib/db/demo-sessions";
import type { DemoNoteRow } from "@/lib/db/demo-notes";
import { DemoTurn } from "@/components/demo/DemoTurn";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * One client conversation as the user reads it: the transcript exactly as the
 * client saw it, and next to it what they reported.
 *
 * Read only on purpose. The turns are not clickable here, because a note on
 * this screen would be the user's own note pretending to be the client's. What
 * the user does with a report is approve it, reject it, or rewrite it before
 * approving, and that is the notes column, not the transcript.
 */
export function DemoLinkWorkspace({
  linkId,
  sessionId,
  renderNoteActions,
  refreshKey = 0,
}: {
  linkId: string;
  sessionId: string;
  /** Supplied by the page so the review controls can live in one place
   *  (S18-T6) without this component knowing how approval works. */
  renderNoteActions?: (note: DemoNoteRow) => React.ReactNode;
  refreshKey?: number;
}) {
  const [session, setSession] = useState<DemoSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo-links/${linkId}/sessions/${sessionId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cargar.");
      setSession(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la conversación.");
    } finally {
      setLoading(false);
    }
  }, [linkId, sessionId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading && !session) return <p className="empty-hint">Cargando conversación…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!session) return null;

  const notes = session.notes;
  // A note's number in this column is the pin drawn on the turns it tags, the
  // same convention the Playground uses.
  const pinsByMessage = new Map<string, number[]>();
  notes.forEach((note, i) => {
    for (const mid of note.message_ids) {
      pinsByMessage.set(mid, [...(pinsByMessage.get(mid) ?? []), i + 1]);
    }
  });

  return (
    <div className="playground-layout">
      <div className="playground-chat">
        <div className="chat-messages">
          {session.messages.length === 0 && (
            <p className="empty-hint">Esta persona abrió el link pero no escribió nada.</p>
          )}
          {session.messages.map((m) => (
            <DemoTurn
              key={m.id}
              id={m.id}
              role={m.role}
              content={m.content}
              pins={pinsByMessage.get(m.id) ?? []}
            />
          ))}
        </div>
      </div>

      <aside className="notes-panel notes-card">
        <div className="notes-header">
          <p className="section-label" style={{ margin: 0 }}>
            Reportes del cliente
          </p>
          {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
        </div>

        <div className="notes-list">
          {notes.length === 0 && (
            <EmptyState
              icon={<IconNotes size={22} />}
              title="Sin reportes"
              description="Esta persona conversó pero no reportó nada."
            />
          )}
          {notes.map((note, i) => (
            <div key={note.id} className="note-card">
              <div className="note-head">
                <span className="chat-pin note-index">{i + 1}</span>
                {note.message_ids.length === 0 && <span className="note-general">General</span>}
                <span className={`note-status is-${note.status}`}>
                  {note.status === "pending"
                    ? "Sin revisar"
                    : note.status === "approved"
                      ? "Aprobada"
                      : "Descartada"}
                </span>
              </div>
              <p className="note-text">{note.text}</p>
              {note.expected && (
                <p className="note-expected">
                  <span className="section-label">Debió responder</span>
                  {note.expected}
                </p>
              )}
              {renderNoteActions?.(note)}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

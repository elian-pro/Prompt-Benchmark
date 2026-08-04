"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconCheck, IconNotes, IconPencil, IconX } from "@tabler/icons-react";

import type { DemoSessionDetail } from "@/lib/db/demo-sessions";
import type { DemoNoteRow, DemoNoteStatus } from "@/lib/db/demo-notes";
import { messagePreview } from "@/lib/adversarial-message";
import { DemoTurn } from "@/components/demo/DemoTurn";
import { Button } from "@/components/ui/Button";
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
  onReviewed,
}: {
  linkId: string;
  sessionId: string;
  /** Lets the page refresh its pending counters after a verdict. */
  onReviewed?: () => void;
}) {
  const router = useRouter();
  const [session, setSession] = useState<DemoSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftExpected, setDraftExpected] = useState("");
  const [handingOff, setHandingOff] = useState(false);

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
  }, [load]);

  async function review(
    note: DemoNoteRow,
    patch: { status?: DemoNoteStatus; text?: string | null; expected?: string | null },
  ) {
    setBusyNoteId(note.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/demo-links/${linkId}/sessions/${sessionId}/notes/${note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar.");
      const updated: DemoNoteRow = await res.json();
      setSession((prev) =>
        prev ? { ...prev, notes: prev.notes.map((n) => (n.id === updated.id ? updated : n)) } : prev,
      );
      setEditingId(null);
      onReviewed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la revisión.");
    } finally {
      setBusyNoteId(null);
    }
  }

  function startEdit(note: DemoNoteRow) {
    setEditingId(note.id);
    setDraftText(note.text ?? "");
    setDraftExpected(note.expected ?? "");
  }

  // Same handoff contract as the Playground: the Editor session is created
  // here, the composed message crosses the navigation through sessionStorage
  // and lands in the composer without being sent.
  async function sendToEditor() {
    if (handingOff) return;
    setHandingOff(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo-links/${linkId}/sessions/${sessionId}/handoff`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo enviar al Editor.");
      const { editorSessionId, draftMessage } = await res.json();
      window.sessionStorage.setItem(`playground-handoff:${editorSessionId}`, draftMessage);
      router.push(`/editor/${editorSessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar al Editor.");
      setHandingOff(false);
    }
  }

  if (loading && !session) return <p className="empty-hint">Cargando conversación…</p>;
  if (!session) return error ? <p className="form-error">{error}</p> : null;

  const notes = session.notes;
  const approvedCount = notes.filter((n) => n.status === "approved").length;
  // note_messages carries the turns from rounds the client restarted past, so a
  // report about one of those still quotes what it was about instead of
  // pointing at a pin that is no longer on screen.
  const messagesById = new Map(
    [...session.messages, ...session.note_messages].map((m) => [m.id, m]),
  );
  const currentIds = new Set(session.messages.map((m) => m.id));
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
                {note.status !== "pending" && editingId !== note.id && (
                  <div className="note-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => startEdit(note)}
                      aria-label="Editar nota"
                    >
                      <IconPencil size={14} />
                    </button>
                  </div>
                )}
              </div>

              {note.message_ids.length > 0 && (
                <div className="note-refs">
                  {note.message_ids.map((mid) => {
                    const m = messagesById.get(mid);
                    return (
                      <div
                        key={mid}
                        className={`note-ref${currentIds.has(mid) ? "" : " note-ref-stale"}`}
                      >
                        “{m ? messagePreview(m.content) : "(mensaje no disponible)"}”
                        {!currentIds.has(mid) && (
                          <span className="note-ref-tag">conversación anterior</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {editingId === note.id ? (
                <div className="note-review-edit">
                  {/* Same order as the client sees: the fix leads, the
                      complaint is context. */}
                  <textarea
                    className="textarea"
                    rows={3}
                    value={draftExpected}
                    onChange={(e) => setDraftExpected(e.target.value)}
                    placeholder="Qué debió responder"
                  />
                  <textarea
                    className="textarea"
                    rows={2}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    placeholder="Qué está mal"
                  />
                  <div className="note-composer-actions">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        !(draftExpected.trim() || draftText.trim()) || busyNoteId === note.id
                      }
                      onClick={() =>
                        review(note, {
                          expected: draftExpected.trim() || null,
                          text: draftText.trim() || null,
                        })
                      }
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {note.expected && (
                    <p className="note-text">
                      <span className="section-label">Debió responder</span>
                      {note.expected}
                    </p>
                  )}
                  {note.text && <p className="note-expected">{note.text}</p>}
                </>
              )}

              {note.status === "pending" && editingId !== note.id && (
                <div className="note-review-actions">
                  <Button
                    size="sm"
                    disabled={busyNoteId === note.id}
                    onClick={() => review(note, { status: "approved" })}
                    icon={<IconCheck size={14} />}
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyNoteId === note.id}
                    onClick={() => startEdit(note)}
                    icon={<IconPencil size={14} />}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyNoteId === note.id}
                    onClick={() => review(note, { status: "rejected" })}
                    icon={<IconX size={14} />}
                  >
                    Descartar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}

        {approvedCount > 0 && (
          <Button
            variant="primary"
            onClick={sendToEditor}
            disabled={handingOff}
            icon={<IconArrowRight size={14} />}
          >
            {handingOff
              ? "Abriendo el Editor…"
              : `Enviar ${approvedCount} al Editor`}
          </Button>
        )}
      </aside>
    </div>
  );
}

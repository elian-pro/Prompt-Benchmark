"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconNotes, IconSend, IconTrash, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/Button";
import {
  CLIENT_LABELS,
  DemoTurn,
  PendingTurn,
  TypingIndicator,
} from "@/components/demo/DemoTurn";
import { DemoInstructions } from "@/components/demo/DemoInstructions";

/**
 * The client's whole experience of a demo link: read the instructions, talk to
 * the assistant, tag what went wrong.
 *
 * Deliberately missing, compared to the Playground this is modelled on: no
 * version picker, no reset, no editing the opening message, no "Enviar al
 * Editor", no way to see anyone else's conversation. Those are not hidden in
 * the UI, they do not exist on the public API either.
 */

type PublicMessage = {
  id: string;
  role: "human" | "bot";
  content: string;
  turn_number: number;
  created_at: string;
};

type PublicNote = {
  id: string;
  text: string;
  expected: string | null;
  message_ids: string[];
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type PublicSession = {
  id: string | null;
  client_name?: string | null;
  messages: PublicMessage[];
  notes: PublicNote[];
};

const STATUS_LABEL: Record<PublicNote["status"], string> = {
  pending: "Enviada",
  approved: "Aceptada",
  rejected: "Revisada",
};

export function DemoClient({
  token,
  clientName,
}: {
  token: string;
  clientName: string | null;
}) {
  // The instructions gate. Remembered per link so a client who comes back to
  // keep testing is not lectured twice, but a different link explains itself
  // again because it may be a different round with different goals.
  const [started, setStarted] = useState(false);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingHuman, setPendingHuman] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteExpected, setNoteExpected] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(`demo-seen:${token}`) === "1") setStarted(true);
    } catch {
      // Private mode with storage disabled: showing the instructions again is
      // the harmless outcome, so there is nothing to handle.
    }
  }, [token]);

  const start = useCallback(() => {
    try {
      window.localStorage.setItem(`demo-seen:${token}`, "1");
    } catch {
      /* see above */
    }
    setStarted(true);
  }, [token]);

  // Opening the conversation is a POST: it creates the session on first visit
  // and resumes it after that. A GET would be wrong here, and is what link
  // preview crawlers hit.
  useEffect(() => {
    if (!started || session) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/prueba/${token}/session`, { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudo abrir el chat.");
        if (!cancelled) setSession(body);
      } catch (e) {
        if (!cancelled) setFatal(e instanceof Error ? e.message : "No se pudo abrir el chat.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [started, session, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, sending]);

  function toggleSelect(messageId: string) {
    setSelectedIds((prev) =>
      prev.includes(messageId) ? prev.filter((x) => x !== messageId) : [...prev, messageId],
    );
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setPendingHuman(content);
    try {
      const res = await fetch(`/api/prueba/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo enviar el mensaje.");
      setSession((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, body.humanMessage, body.botMessage] }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar el mensaje.");
      setInput(content);
    } finally {
      setSending(false);
      setPendingHuman(null);
    }
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/prueba/${token}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          expected: noteExpected.trim() || undefined,
          messageIds: selectedIds,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo enviar la nota.");
      setSession((prev) => (prev ? { ...prev, notes: [...prev.notes, body] } : prev));
      setNoteText("");
      setNoteExpected("");
      setSelectedIds([]);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error al enviar la nota.");
    } finally {
      setSavingNote(false);
    }
  }

  async function removeNote(noteId: string) {
    try {
      const res = await fetch(`/api/prueba/${token}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo eliminar la nota.");
      setSession((prev) =>
        prev ? { ...prev, notes: prev.notes.filter((n) => n.id !== noteId) } : prev,
      );
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error al eliminar la nota.");
    }
  }

  if (!started) {
    return (
      <div className="public-demo">
        <DemoInstructions clientName={clientName} onStart={start} />
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="public-demo">
        <div className="demo-gate">
          <div className="demo-gate-card">
            <h1 className="demo-gate-title">No pudimos abrir el chat</h1>
            <p className="demo-gate-lead">{fatal}</p>
          </div>
        </div>
      </div>
    );
  }

  const notes = session?.notes ?? [];
  const messages = session?.messages ?? [];
  const composing = selectedIds.length > 0 || noteText.trim().length > 0;
  const noteIndexByMessage = new Map<string, number[]>();
  notes.forEach((note, i) => {
    for (const mid of note.message_ids) {
      noteIndexByMessage.set(mid, [...(noteIndexByMessage.get(mid) ?? []), i + 1]);
    }
  });

  return (
    <div className="public-demo">
      <header className="demo-header">
        <span className="pill-logo">{clientName ?? "Asistente"}</span>
        <span className="demo-header-hint">
          Toca cualquier mensaje para reportar algo sobre él
        </span>
      </header>

      <div className="playground-layout demo-body">
        <div className="playground-chat">
          <div className="chat-messages">
            {loading && <p className="empty-hint">Abriendo el chat…</p>}
            {!loading && messages.length === 0 && !pendingHuman && (
              <p className="empty-hint">
                Escribe tu primer mensaje para empezar, como si fueras un cliente preguntando.
              </p>
            )}
            {messages.map((m) => (
              <DemoTurn
                key={m.id}
                id={m.id}
                role={m.role}
                content={m.content}
                labels={CLIENT_LABELS}
                selected={selectedIds.includes(m.id)}
                pins={noteIndexByMessage.get(m.id) ?? []}
                onToggleSelect={toggleSelect}
              />
            ))}
            {pendingHuman && <PendingTurn content={pendingHuman} labels={CLIENT_LABELS} />}
            {sending && <TypingIndicator labels={CLIENT_LABELS} />}
            <div ref={bottomRef} />
          </div>

          {error && (
            <p className="form-error" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}

          <div className="chat-composer-zone">
            <div className="idle-composer chat-composer">
              <textarea
                ref={textareaRef}
                className="idle-composer-input"
                rows={1}
                value={input}
                onChange={onInputChange}
                onKeyDown={(e) => {
                  // Plain Enter sends, unlike the Playground's Cmd+Enter. The
                  // client is writing in a chat, and every chat they use works
                  // this way; Shift+Enter still breaks the line.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Escribe tu mensaje…"
                disabled={sending || loading}
              />
              <div className="idle-composer-footrow">
                <span className="idle-composer-hint">
                  {sending ? "Enviando…" : "Enter para enviar"}
                </span>
                <button
                  type="button"
                  className="idle-send-btn"
                  onClick={send}
                  disabled={sending || loading || !input.trim()}
                  aria-label="Enviar"
                >
                  <IconSend size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="notes-panel notes-card">
          <div className="notes-header">
            <p className="section-label" style={{ margin: 0 }}>
              Lo que reportaste
            </p>
            {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
          </div>

          <div className="notes-list">
            {notes.length === 0 && (
              <div className="notes-empty">
                <IconNotes size={22} stroke={1.5} />
                <p>
                  Cuando algo no te cuadre, toca el mensaje en el chat y descríbelo aquí. Así
                  sabemos exactamente de qué respuesta hablas.
                </p>
              </div>
            )}
            {notes.map((note, i) => (
              <div key={note.id} className="note-card">
                <div className="note-head">
                  <span className="chat-pin note-index">{i + 1}</span>
                  {note.message_ids.length === 0 && <span className="note-general">General</span>}
                  <span className={`note-status is-${note.status}`}>
                    {STATUS_LABEL[note.status]}
                  </span>
                  {note.status === "pending" && (
                    <div className="note-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeNote(note.id)}
                        aria-label="Eliminar nota"
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="note-text">{note.text}</p>
                {note.expected && (
                  <p className="note-expected">
                    <span className="section-label">Debió responder</span>
                    {note.expected}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className={`note-composer${composing ? " is-active" : ""}`}>
            <span className="note-composer-title">Reportar algo</span>
            {selectedIds.length > 0 && (
              <div className="note-selected">
                <span>
                  {selectedIds.length} mensaje{selectedIds.length > 1 ? "s" : ""} seleccionado
                  {selectedIds.length > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSelectedIds([])}
                  aria-label="Quitar selección"
                >
                  <IconX size={14} />
                </button>
              </div>
            )}
            <textarea
              className="textarea"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="¿Qué estuvo mal?"
              rows={3}
            />
            <textarea
              className="textarea"
              value={noteExpected}
              onChange={(e) => setNoteExpected(e.target.value)}
              placeholder="¿Qué debió responder? (opcional)"
              rows={2}
            />
            {noteError && <p className="form-error">{noteError}</p>}
            <div className="note-composer-actions">
              <Button onClick={saveNote} disabled={!noteText.trim() || savingNote}>
                {savingNote ? "Enviando…" : "Enviar reporte"}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

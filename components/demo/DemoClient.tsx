"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconNotes, IconRefresh, IconSend, IconTrash, IconX } from "@tabler/icons-react";

import { messagePreview } from "@/lib/adversarial-message";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Modal } from "@/components/ui/Modal";
import {
  CLIENT_LABELS,
  DemoTurn,
  PendingTurn,
  TypingIndicator,
} from "@/components/demo/DemoTurn";
import { DemoInstructions } from "@/components/demo/DemoInstructions";
import { gateStateFor } from "@/lib/demo-visit";
import { ZebraWordmark } from "@/components/ui/ZebraWordmark";
import { resError } from "@/lib/res-error";

/**
 * The client's whole experience of a demo link: read the instructions, talk to
 * the agent, tag what went wrong.
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
  /** Messages from an earlier round, kept so a note written before the client
   *  restarted the chat still quotes what it was about. */
  note_messages: PublicMessage[];
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
  deadline,
}: {
  token: string;
  clientName: string | null;
  /** Last day they can leave reports, YYYY-MM-DD. Null: no deadline. */
  deadline: string | null;
}) {
  // The instructions gate. What is remembered per link is WHEN the client was
  // last active, not merely that they were: coming back to keep testing right
  // away skips the instructions, coming back tomorrow does not. A different
  // link always explains itself again, since it may be a different round with
  // different goals.
  const [started, setStarted] = useState(false);
  /** First visit ever to this link: the instructions arrive one step at a
   *  time. A return visit gets the whole card and one button. */
  const [firstTime, setFirstTime] = useState(true);
  /** Whether localStorage has been read yet. Nothing renders before it: the
   *  instructions look different for a first visit than for a return one, and
   *  guessing means showing the wrong card and then swapping it. */
  const [checked, setChecked] = useState(false);
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
  const [resetOpen, setResetOpen] = useState(false);
  /** On a phone the reports do not fit beside the chat, so they live in a
   *  sheet that rises from the bottom: opened by tagging a message, which is
   *  when you have something to report, or by the counter in the header. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const gate = gateStateFor(window.localStorage.getItem(`demo-seen:${token}`), Date.now());
      setFirstTime(gate.stepped);
      if (gate.started) setStarted(true);
    } catch {
      // Private mode with storage disabled: showing the instructions again is
      // the harmless outcome, so there is nothing to handle.
    } finally {
      setChecked(true);
    }
  }, [token]);

  /** Marks the visit as alive. Called when the gate is passed and on every
   *  message, so half an hour of silence is what ends it, not half an hour of
   *  clock. */
  const touch = useCallback(() => {
    try {
      window.localStorage.setItem(`demo-seen:${token}`, String(Date.now()));
    } catch {
      /* see above */
    }
  }, [token]);

  const start = useCallback(() => {
    touch();
    setStarted(true);
  }, [touch]);

  // Opening the conversation is a POST: it creates the session on first visit
  // and resumes it after that. A GET would be wrong here, and is what link
  // preview crawlers hit.
  const openSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prueba/${token}/session`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo abrir el chat.");
      setSession(body);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "No se pudo abrir el chat.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!started || session) return;
    void openSession();
  }, [started, session, openSession]);

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
    touch();
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
    const expected = noteExpected.trim();
    if (!expected || savingNote) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/prueba/${token}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected,
          text: noteText.trim() || undefined,
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

  // Starts a fresh round. The reports already sent are kept: they are about
  // messages that really happened, and the client may want to keep testing
  // from zero without losing them.
  async function reset() {
    if (resetting) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/prueba/${token}/reset`, { method: "POST" });
      if (!res.ok) throw new Error(await resError(res, "No se pudo reiniciar."));
      setSelectedIds([]);
      setResetOpen(false);
      await openSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reiniciar la conversación.");
    } finally {
      setResetting(false);
    }
  }

  async function removeNote(noteId: string) {
    try {
      const res = await fetch(`/api/prueba/${token}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await resError(res, "No se pudo eliminar la nota."));
      setSession((prev) =>
        prev ? { ...prev, notes: prev.notes.filter((n) => n.id !== noteId) } : prev,
      );
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error al eliminar la nota.");
    }
  }

  // One frame of nothing while the visit is read, instead of the wrong card.
  if (!checked) return null;

  if (!started) {
    return (
      <div className="public-demo">
        <DemoInstructions
          clientName={clientName}
          stepped={firstTime}
          deadline={deadline}
          onStart={start}
        />
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

  // Includes messages from earlier rounds, so a report written before a reset
  // still shows what it was about.
  const messagesById = new Map(
    [...messages, ...(session?.note_messages ?? [])].map((m) => [m.id, m]),
  );
  const currentIds = new Set(messages.map((m) => m.id));

  function previewOf(messageId: string): string {
    const m = messagesById.get(messageId);
    return m ? messagePreview(m.content) : "(mensaje no disponible)";
  }

  return (
    <div className="public-demo">
      <header className="demo-header">
        {/* Says what the page is once the instructions modal is gone. Without
            it the screen is a chat with a client's name on it and no clue that
            this is a testing round. */}
        <div className="demo-header-id">
          {/* Ours first, then whose agent is being tested. The client is on a
              page with no other sign of who built it. */}
          <ZebraWordmark height={17} />
          <span className="demo-header-sep" aria-hidden="true" />
          <span className="pill-logo">{clientName ?? "Agente"}</span>
          <div>
            <p className="section-label">Pruebas y validación</p>
            <p className="demo-header-title">
              Prueba el agente y repórtanos lo que no cuadre
            </p>
          </div>
        </div>

        {/* No "toca un mensaje para reportar" here: the notes panel already
            says it, right where the reporting happens. */}
        {messages.length > 0 && (
          <span className="demo-reset">
            {/* Phone only: the way back to the reports once the sheet is
                closed. On a wide screen the panel is simply there. */}
            <button
              type="button"
              className="demo-sheet-open"
              onClick={() => setSheetOpen(true)}
              aria-label={
                notes.length === 1 ? "Ver tu reporte" : `Ver tus ${notes.length} reportes`
              }
            >
              <IconNotes size={16} stroke={1.5} />
              {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(true)}
              icon={<IconRefresh size={14} stroke={1.5} />}
            >
              <span className="btn-label">Reiniciar</span>
            </Button>
            <InfoHint
              placement="bottom"
              text="Empieza el chat de nuevo, desde cero, para probar otra conversación. Lo que ya reportaste no se borra."
            />
          </span>
        )}
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

        {/* Phone: picking messages is its own moment, the way it is in
            WhatsApp. Tapping one no longer opens the report form, because the
            form covered the chat and the next message could not be reached.
            The bar counts what is picked and moves on when you say so. */}
        {selectedIds.length > 0 && !sheetOpen && (
          <div className="demo-selection-bar">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSelectedIds([])}
              aria-label="Quitar la selección"
            >
              <IconX size={16} stroke={1.5} />
            </button>
            <span className="demo-selection-count">
              {selectedIds.length === 1
                ? "1 mensaje seleccionado"
                : `${selectedIds.length} mensajes seleccionados`}
            </span>
            <Button variant="primary" size="sm" onClick={() => setSheetOpen(true)}>
              Reportar
            </Button>
          </div>
        )}

        {sheetOpen && (
          <div
            className="demo-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside className={`notes-panel notes-card demo-sheet${sheetOpen ? " is-open" : ""}`}>
          <div className="notes-header">
            <p className="section-label" style={{ margin: 0 }}>
              Lo que reportaste
            </p>
            {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
            <button
              type="button"
              className="icon-btn demo-sheet-close"
              onClick={() => setSheetOpen(false)}
              aria-label="Cerrar reportes"
            >
              <IconX size={16} stroke={1.5} />
            </button>
          </div>

          <div className="notes-list">
            {notes.length === 0 && (
              <div className="notes-empty">
                <IconNotes size={22} stroke={1.5} />
                <p>
                  Cuando algo no te cuadre, toca el mensaje en el chat y dinos qué debió
                  responder. Así sabemos exactamente de qué respuesta hablas.
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
                {note.message_ids.length > 0 && (
                  <div className="note-refs">
                    {note.message_ids.map((mid) => (
                      <div
                        key={mid}
                        className={`note-ref${currentIds.has(mid) ? "" : " note-ref-stale"}`}
                      >
                        “{previewOf(mid)}”
                        {!currentIds.has(mid) && (
                          <span className="note-ref-tag">conversación anterior</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {note.expected && (
                  <p className="note-field">
                    <span className="section-label">Debió responder</span>
                    {note.expected}
                  </p>
                )}
                {note.text && (
                  <p className="note-field">
                    <span className="section-label">Qué está mal</span>
                    {note.text}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className={`note-composer${composing ? " is-active" : ""}`}>
            <span className="note-composer-title">Reportar algo</span>
            {selectedIds.length > 0 && (
              <>
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
                {/* Quoting them here is what makes the selection checkable: the
                    chat scrolls away while writing, and "1 mensaje
                    seleccionado" does not say which one. */}
                <div className="note-refs">
                  {selectedIds.map((mid) => (
                    <div key={mid} className="note-ref note-ref-draft">
                      “{previewOf(mid)}”
                      <button
                        type="button"
                        className="icon-btn note-ref-drop"
                        onClick={() => toggleSelect(mid)}
                        aria-label="Quitar este mensaje"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* The fix comes first and is the required one: it is what gets
                the prompt corrected. The complaint is usually legible from the
                message they tagged. */}
            <textarea
              className="textarea"
              value={noteExpected}
              onChange={(e) => setNoteExpected(e.target.value)}
              placeholder="¿Qué debió responder? *"
              rows={3}
            />
            <textarea
              className="textarea"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="¿Qué estuvo mal?"
              rows={2}
            />
            {noteError && <p className="form-error">{noteError}</p>}
            <div className="note-composer-actions">
              <Button variant="primary" onClick={saveNote} disabled={!noteExpected.trim() || savingNote}>
                {savingNote ? "Enviando…" : "Enviar reporte"}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="¿Empezar de nuevo?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={reset} disabled={resetting}>
              {resetting ? "Reiniciando…" : "Sí, reiniciar"}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          El chat vuelve a empezar desde cero, como si fuera la primera vez. Lo que ya
          reportaste se conserva, así que no pierdes nada de lo que nos escribiste.
        </p>
      </Modal>
    </div>
  );
}

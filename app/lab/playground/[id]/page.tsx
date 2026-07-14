"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconArrowLeft,
  IconArrowRight,
  IconPencil,
  IconSend,
  IconTrash,
  IconNotes,
  IconCheck,
  IconX,
  IconRefresh,
} from "@tabler/icons-react";
import type {
  DemoSessionDetail,
  DemoMessageRole,
  DemoMessageRow,
} from "@/lib/db/demo-sessions";
import type { DemoNoteRow } from "@/lib/db/demo-notes";
import { parseTurn, parseTurnBubbles } from "@/lib/adversarial-message";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/** Any special state with no readable message names itself explicitly,
 *  e.g. "El bot pasó a estado «humano» y dejó de responder." — this is
 *  exactly what a live test needs to verify (Sprint 6, decision 2). */
function emptyBotMessage(state: string | null): string {
  return state ? `El bot pasó a estado «${state}» y dejó de responder.` : "El bot no envió mensaje.";
}

/** A persisted turn: clickable to tag it into the note being composed, and
 *  carries numbered pins for whichever notes already reference it. */
function Turn({
  id,
  role,
  content,
  selected,
  pins,
  flashed,
  onToggleSelect,
  onJumpToNote,
  registerRef,
}: {
  id: string;
  role: DemoMessageRole;
  content: string;
  selected: boolean;
  pins: number[];
  flashed: boolean;
  onToggleSelect: (id: string) => void;
  onJumpToNote: (noteIndex: number) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const side = role === "bot" ? "turn-bot" : "turn-lead";
  const roleLabel = role === "bot" ? "Bot del cliente" : "Tú (lead)";
  const { messages, state } = parseTurnBubbles(content);
  // A turn with no readable text (e.g. the bot only emitted an estado) still
  // renders a single explanatory bubble, so nothing looks silently dropped.
  const bubbles = messages.length > 0 ? messages : [emptyBotMessage(state)];
  const isEmpty = messages.length === 0;

  return (
    <div
      ref={(el) => registerRef(id, el)}
      className={`chat-turn ${side}${selected ? " is-selected" : ""}${flashed ? " is-flashed" : ""}`}
      onClick={() => onToggleSelect(id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect(id);
        }
      }}
    >
      {pins.length > 0 && (
        <div className="chat-pins">
          {pins.map((p) => (
            <button
              key={p}
              type="button"
              className="chat-pin"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToNote(p - 1);
              }}
              aria-label={`Ir a la nota ${p}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <span className="chat-turn-role">{roleLabel}</span>
      {bubbles.map((b, i) => {
        const isLast = i === bubbles.length - 1;
        return (
          <div key={i} className="chat-msg">
            <div className={`chat-content${isEmpty ? " chat-empty" : ""}`}>{b}</div>
            {/* The estado hangs off the last bubble, WhatsApp-style. */}
            {state && isLast && !isEmpty && (
              <div className="chat-state">
                <span className="chat-state-label">Estado</span>
                <span className="chat-state-value">{state}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The optimistic bubble shown right after sending, before the reload —
 *  never persisted yet, so it has no id and can't be tagged. */
function PendingTurn({ content }: { content: string }) {
  return (
    <div className="chat-turn turn-lead">
      <span className="chat-turn-role">Tú (lead)</span>
      <div className="chat-msg">
        <div className="chat-content">{content}</div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-turn turn-bot">
      <span className="chat-turn-role">Bot del cliente</span>
      <div className="chat-msg">
        <div className="chat-content chat-typing">
          Escribiendo
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}

function NotesPanel({
  notes,
  selectedIds,
  draftText,
  onDraftChange,
  editingNoteId,
  savingNote,
  noteError,
  messagesById,
  onStartEdit,
  onCancelCompose,
  onSaveNote,
  onDeleteNote,
  onToggleSelect,
  onJumpToMessage,
  registerNoteRef,
  flashNoteId,
  currentMessageIds,
}: {
  notes: DemoNoteRow[];
  selectedIds: string[];
  draftText: string;
  onDraftChange: (v: string) => void;
  editingNoteId: string | null;
  savingNote: boolean;
  noteError: string | null;
  messagesById: Map<string, DemoMessageRow>;
  onStartEdit: (note: DemoNoteRow) => void;
  onCancelCompose: () => void;
  onSaveNote: () => void;
  onDeleteNote: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onJumpToMessage: (id: string) => void;
  registerNoteRef: (id: string, el: HTMLDivElement | null) => void;
  flashNoteId: string | null;
  currentMessageIds: Set<string>;
}) {
  const isComposing = editingNoteId !== null || selectedIds.length > 0 || draftText.trim().length > 0;

  return (
    <aside className="notes-panel notes-card">
      <div className="notes-header">
        <p className="section-label" style={{ margin: 0 }}>
          Notas
        </p>
        {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
      </div>

      <div className="notes-list">
        {notes.length === 0 && (
          <div className="notes-empty">
            <IconNotes size={22} stroke={1.5} />
            <p>
              Aún no hay notas. Haz clic en uno o más mensajes para taggearlos, o escribe una
              nota general sin seleccionar nada.
            </p>
          </div>
        )}
        {notes.map((note, i) => (
          <div
            key={note.id}
            ref={(el) => registerNoteRef(note.id, el)}
            className={`note-card${flashNoteId === note.id ? " is-flashed" : ""}`}
          >
            <div className="note-head">
              <span className="chat-pin note-index">{i + 1}</span>
              {note.message_ids.length === 0 && <span className="note-general">General</span>}
              <div className="note-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onStartEdit(note)}
                  aria-label="Editar nota"
                >
                  <IconPencil size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onDeleteNote(note.id)}
                  aria-label="Eliminar nota"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>

            {note.message_ids.length > 0 && (
              <div className="note-refs">
                {note.message_ids.map((mid) => {
                  const m = messagesById.get(mid);
                  if (!m) return null;
                  const { message } = parseTurn(m.content);
                  const text = message || "(sin mensaje)";
                  const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
                  // A ref to a message not in the current round: its preview
                  // still resolves, but jumping to it in the chat can't (it's
                  // not shown), so it's inert and marked.
                  const olderRound = !currentMessageIds.has(mid);
                  return (
                    <button
                      key={mid}
                      type="button"
                      className={`note-ref${olderRound ? " note-ref-stale" : ""}`}
                      onClick={() => !olderRound && onJumpToMessage(mid)}
                      title={olderRound ? "De una conversación anterior" : "Ir al mensaje"}
                    >
                      “{preview}”
                      {olderRound && <span className="note-ref-tag">conversación anterior</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="note-text">{note.text}</p>
          </div>
        ))}
      </div>

      <div className={`note-composer${isComposing ? " is-active" : ""}`}>
        {isComposing && (
          <p className="note-composer-title">
            {editingNoteId ? "Editando nota" : "Nueva nota"}
          </p>
        )}

        {/* The tagged bubbles show as soon as messages are selected, before
            saving, so you see exactly what the note points at. */}
        {selectedIds.length > 0 && (
          <div className="note-refs">
            {selectedIds.map((mid) => {
              const m = messagesById.get(mid);
              const { message } = m ? parseTurn(m.content) : { message: "" };
              const text = message || "(sin mensaje)";
              const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
              return (
                <div key={mid} className="note-ref note-ref-draft">
                  <button
                    type="button"
                    className="note-ref-quote"
                    onClick={() => onJumpToMessage(mid)}
                    title="Ir al mensaje"
                  >
                    “{preview}”
                  </button>
                  <button
                    type="button"
                    className="note-ref-remove"
                    onClick={() => onToggleSelect(mid)}
                    aria-label="Quitar este mensaje de la nota"
                  >
                    <IconX size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <textarea
          className="textarea"
          rows={3}
          value={draftText}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={
            selectedIds.length > 0
              ? "Escribe tu feedback sobre lo seleccionado…"
              : "Escribe una nota general, o selecciona mensajes para taggearlos…"
          }
        />
        {noteError && <p className="form-error">{noteError}</p>}
        <div className="note-composer-actions">
          {isComposing && (
            <button
              type="button"
              className="note-act-btn"
              onClick={onCancelCompose}
              aria-label="Cancelar nota"
              title="Cancelar"
            >
              <IconX size={16} />
            </button>
          )}
          <button
            type="button"
            className="note-act-btn note-act-save"
            onClick={onSaveNote}
            disabled={savingNote || !draftText.trim()}
            aria-label={editingNoteId ? "Guardar cambios" : "Guardar nota"}
            title={editingNoteId ? "Guardar cambios" : "Guardar nota"}
          >
            <IconCheck size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function PlaygroundSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [session, setSession] = useState<DemoSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingHuman, setPendingHuman] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [notes, setNotes] = useState<DemoNoteRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftText, setDraftText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [flashNoteId, setFlashNoteId] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo-sessions/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      const data: DemoSessionDetail = await res.json();
      setSession(data);
      setNotes(data.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la conversación.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session?.messages.length, pendingHuman, sending]);

  const messagesById = useMemo(() => {
    const map = new Map<string, DemoMessageRow>();
    // Older-round messages referenced by notes are resolved too, so their
    // bubble previews survive a reset / version switch.
    session?.note_messages?.forEach((m) => map.set(m.id, m));
    session?.messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [session?.messages, session?.note_messages]);

  // Every message's pin numbers: which notes (1-indexed, in creation order)
  // reference it. A message can carry more than one pin.
  const pinsByMessageId = useMemo(() => {
    const map = new Map<string, number[]>();
    notes.forEach((note, i) => {
      note.message_ids.forEach((mid) => {
        const arr = map.get(mid) ?? [];
        arr.push(i + 1);
        map.set(mid, arr);
      });
    });
    return map;
  }, [notes]);

  function registerMessageRef(messageId: string, el: HTMLDivElement | null) {
    messageRefs.current[messageId] = el;
  }
  function registerNoteRef(noteId: string, el: HTMLDivElement | null) {
    noteRefs.current[noteId] = el;
  }

  function toggleSelect(messageId: string) {
    setSelectedIds((prev) =>
      prev.includes(messageId) ? prev.filter((x) => x !== messageId) : [...prev, messageId],
    );
  }

  function startEditNote(note: DemoNoteRow) {
    setEditingNoteId(note.id);
    setDraftText(note.text);
    setSelectedIds(note.message_ids);
    setNoteError(null);
  }

  function cancelCompose() {
    setEditingNoteId(null);
    setDraftText("");
    setSelectedIds([]);
    setNoteError(null);
  }

  async function saveNote() {
    const text = draftText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      if (editingNoteId) {
        const res = await fetch(`/api/demo-sessions/${id}/notes/${editingNoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, messageIds: selectedIds }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo actualizar la nota.");
        const updated: DemoNoteRow = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        const res = await fetch(`/api/demo-sessions/${id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, messageIds: selectedIds }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo guardar la nota.");
        const created: DemoNoteRow = await res.json();
        setNotes((prev) => [...prev, created]);
      }
      cancelCompose();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error al guardar la nota.");
    } finally {
      setSavingNote(false);
    }
  }

  async function removeNote(noteId: string) {
    try {
      const res = await fetch(`/api/demo-sessions/${id}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo eliminar la nota.");
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (editingNoteId === noteId) cancelCompose();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error al eliminar la nota.");
    }
  }

  function jumpToMessage(messageId: string) {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashMessageId(messageId);
    window.setTimeout(() => setFlashMessageId((cur) => (cur === messageId ? null : cur)), 1600);
  }

  function jumpToNote(noteIndex: number) {
    const note = notes[noteIndex];
    if (!note) return;
    noteRefs.current[note.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashNoteId(note.id);
    window.setTimeout(() => setFlashNoteId((cur) => (cur === note.id ? null : cur)), 1600);
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
    if (!content || sending || session?.status !== "active") return;
    setSending(true);
    setError(null);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setPendingHuman(content);
    try {
      const res = await fetch(`/api/demo-sessions/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo enviar el mensaje.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar el mensaje.");
      setInput(content);
    } finally {
      setSending(false);
      setPendingHuman(null);
    }
  }

  // Creates the Editor session on the tested version, composes the first
  // message from the notes, and lands there with it pre-filled but not sent
  // (Sprint 6, decision 6). The draft crosses the page navigation via
  // sessionStorage — see app/editor/[id]/page.tsx, which reads and clears it.
  async function sendToEditor() {
    if (handingOff || notes.length === 0 || session?.status !== "active") return;
    setHandingOff(true);
    setHandoffError(null);
    try {
      const res = await fetch(`/api/demo-sessions/${id}/handoff`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo enviar al Editor.");
      const { editorSessionId, draftMessage } = await res.json();
      window.sessionStorage.setItem(`playground-handoff:${editorSessionId}`, draftMessage);
      router.push(`/editor/${editorSessionId}`);
    } catch (e) {
      setHandoffError(e instanceof Error ? e.message : "Error al enviar al Editor.");
      setHandingOff(false);
    }
  }

  // Starts a fresh round (keeps notes). Clears any in-progress composition
  // since its selected messages leave the current view.
  async function resetConversation() {
    setResetting(true);
    try {
      const res = await fetch(`/api/demo-sessions/${id}/reset`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo reiniciar.");
      setResetOpen(false);
      cancelCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reiniciar la conversación.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error && !session) return <p className="form-error">{error}</p>;
  if (!session) return <p className="empty-hint">Conversación no encontrada.</p>;

  const isActive = session.status === "active";
  // Message ids visible in the current round, so a note referencing an older
  // round can be flagged (its bubble preview still resolves via note_messages).
  const currentMessageIds = new Set(session.messages.map((m) => m.id));

  return (
    <div>
      <div className="detail-header">
        <div>
          <Link href="/lab/playground" className="back-link">
            <IconArrowLeft size={13} /> Playground
          </Link>
          <h1 className="detail-title">{session.client_name ?? "Cliente eliminado"}</h1>
          <div className="detail-sub">
            <span className="muted" style={{ fontSize: 12 }}>
              {session.version_number_snapshot} · {relativeTimeEs(session.created_at)}
            </span>
          </div>
        </div>
        <div className="detail-actions">
          {isActive && session.messages.length > 0 && (
            <Button
              variant="secondary"
              icon={<IconRefresh size={14} />}
              onClick={() => setResetOpen(true)}
              disabled={resetting}
            >
              Reiniciar
            </Button>
          )}
          {session.status === "sent_to_editor" && session.editor_session_id ? (
            <Link
              href={`/editor/${session.editor_session_id}`}
              className="back-link"
              style={{ marginBottom: 0 }}
            >
              Ver en Editor <IconArrowRight size={13} />
            </Link>
          ) : (
            <Button
              variant="primary"
              icon={<IconSend size={14} />}
              onClick={sendToEditor}
              disabled={handingOff || notes.length === 0}
            >
              {handingOff
                ? "Enviando…"
                : `Enviar al Editor (${notes.length} ${notes.length === 1 ? "nota" : "notas"})`}
            </Button>
          )}
        </div>
      </div>
      {handoffError && (
        <p className="form-error" style={{ marginBottom: 16 }}>
          {handoffError}
        </p>
      )}

      <div className="playground-layout">
        <div className="playground-chat">
          <div className="chat-messages" ref={scrollRef}>
            {session.messages.length === 0 && !pendingHuman && (
              <p className="empty-hint">
                Escribe el primer mensaje, como si fueras un lead real, para empezar la
                conversación.
              </p>
            )}
            {session.messages.map((m) => (
              <Turn
                key={m.id}
                id={m.id}
                role={m.role}
                content={m.content}
                selected={selectedIds.includes(m.id)}
                pins={pinsByMessageId.get(m.id) ?? []}
                flashed={flashMessageId === m.id}
                onToggleSelect={toggleSelect}
                onJumpToNote={jumpToNote}
                registerRef={registerMessageRef}
              />
            ))}
            {pendingHuman && <PendingTurn content={pendingHuman} />}
            {sending && <TypingIndicator />}
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
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  isActive
                    ? "Escribe como un lead real…"
                    : "Esta conversación ya no admite mensajes."
                }
                disabled={sending || !isActive}
              />
              <div className="idle-composer-footrow">
                <span className="idle-composer-hint">
                  {sending ? "Enviando…" : "⌘/Ctrl + Enter para enviar"}
                </span>
                <button
                  type="button"
                  className="idle-send-btn"
                  onClick={send}
                  disabled={sending || !isActive || !input.trim()}
                  aria-label="Enviar"
                >
                  <IconSend size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <NotesPanel
          notes={notes}
          selectedIds={selectedIds}
          draftText={draftText}
          onDraftChange={setDraftText}
          editingNoteId={editingNoteId}
          savingNote={savingNote}
          noteError={noteError}
          messagesById={messagesById}
          onStartEdit={startEditNote}
          onCancelCompose={cancelCompose}
          onSaveNote={saveNote}
          onDeleteNote={removeNote}
          onToggleSelect={toggleSelect}
          onJumpToMessage={jumpToMessage}
          registerNoteRef={registerNoteRef}
          flashNoteId={flashNoteId}
          currentMessageIds={currentMessageIds}
        />
      </div>

      <Modal
        open={resetOpen}
        onClose={() => !resetting && setResetOpen(false)}
        title="¿Reiniciar la conversación?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={resetConversation} disabled={resetting}>
              {resetting ? "Reiniciando…" : "Reiniciar"}
            </Button>
          </>
        }
      >
        <p className="modal-body">
          El chat empieza de cero. Tus notas se conservan (siguen visibles aunque no sean
          de la conversación nueva). No se borra nada de forma permanente.
        </p>
      </Modal>
    </div>
  );
}

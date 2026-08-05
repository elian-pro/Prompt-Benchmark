"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconNotes, IconPencil, IconSend, IconTrash, IconX } from "@tabler/icons-react";
import type { ConversationRow } from "@/lib/db/chats-history";
import { transcriptOf } from "@/lib/conversation-turns";
import { Button } from "@/components/ui/Button";
import { Turn } from "@/components/conversation/Turn";

/** A saved note, which is a case with no Editor session yet. */
type Note = {
  id: string;
  nota: string;
  turnos_marcados: number[];
  editor_session_id: string | null;
};

function preview(text: string): string {
  const clean = text.trim() || "(sin mensaje)";
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

/**
 * Working on one real conversation: the transcript on the left, the notes on
 * the right, exactly the shape the Playground uses.
 *
 * A note is stored the moment it is saved, because a note IS a case: writing
 * one and never handing it off still leaves the evidence behind, which is the
 * whole point of Replay. The Editor session comes later and covers every note
 * of the conversation at once.
 */
export function ReplayWorkspace({
  clientId,
  row,
}: {
  clientId: string;
  row: ConversationRow;
}) {
  const router = useRouter();
  const { turns, source } = transcriptOf(row);

  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/cases?rowId=${row.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setNotes(data.cases);
  }, [clientId, row.id]);

  useEffect(() => {
    setSelected([]);
    setDraft("");
    setEditingId(null);
    setError(null);
    loadNotes();
  }, [loadNotes]);

  const composing = editingId !== null || selected.length > 0 || draft.trim().length > 0;

  /** Which notes point at each turn, so the transcript can show their number
   *  the way the Playground pins its own. */
  const pinsByTurn = new Map<number, number[]>();
  notes.forEach((note, i) => {
    for (const t of note.turnos_marcados) {
      pinsByTurn.set(t, [...(pinsByTurn.get(t) ?? []), i + 1]);
    }
  });

  function toggle(index: number) {
    setSelected((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort((a, b) => a - b),
    );
  }

  function cancelCompose() {
    setSelected([]);
    setDraft("");
    setEditingId(null);
    setError(null);
  }

  async function saveNote() {
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        rowId: row.id,
        nota: draft.trim(),
        turnosMarcados: selected,
      });
      const res = editingId
        ? await fetch(`/api/cases/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nota: draft.trim(), turnosMarcados: selected }),
          })
        : await fetch(`/api/clients/${clientId}/cases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la nota.");
      cancelCompose();
      await loadNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la nota.");
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id: string) {
    setError(null);
    const res = await fetch(`/api/cases/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("No se pudo eliminar la nota.");
      return;
    }
    if (editingId === id) cancelCompose();
    await loadNotes();
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setDraft(note.nota);
    setSelected(note.turnos_marcados);
  }

  async function sendToEditor() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/cases/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId: row.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar al Editor.");
      window.sessionStorage.setItem(
        `playground-handoff:${data.editorSessionId}`,
        data.draftMessage,
      );
      router.push(`/editor/${data.editorSessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar al Editor.");
      setSending(false);
    }
  }

  return (
    <div className="replay-workspace">
      <div>
        <div className="row-between" style={{ marginBottom: 8 }}>
          {source === "historial" ? (
            <span className="muted" style={{ fontSize: 11 }}>
              Reconstruido del texto plano: puede tener errores.
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="version-changes-link"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "Ver como chat" : "Ver texto crudo"}
          </button>
        </div>

        {showRaw ? (
          <pre className="version-view-content">
            {row.historial?.trim() ? row.historial : "(Sin contenido.)"}
          </pre>
        ) : turns.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No se pudo leer ningún mensaje. Revisa el texto crudo.
          </p>
        ) : (
          <div className="chat-messages">
            {turns.map((turn, i) => (
              <Turn
                key={i}
                turn={turn}
                selected={selected.includes(i)}
                pins={pinsByTurn.get(i) ?? []}
                onToggle={turn.rol === "sistema" ? undefined : () => toggle(i)}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="notes-panel notes-card">
        <div className="notes-header">
          <p className="section-label" style={{ margin: 0 }}>Notas</p>
          {notes.length > 0 && <span className="notes-count">{notes.length}</span>}
        </div>

        <div className="notes-list">
          {notes.length === 0 && (
            <div className="notes-empty">
              <IconNotes size={22} stroke={1.5} />
              <p>
                Aún no hay notas. Haz clic en uno o más mensajes para taggearlos,
                o escribe una nota general sin seleccionar nada.
              </p>
            </div>
          )}
          {notes.map((note, i) => (
            <div key={note.id} className="note-card">
              <div className="note-head">
                <span className="chat-pin note-index">{i + 1}</span>
                {note.turnos_marcados.length === 0 && (
                  <span className="note-general">General</span>
                )}
                <div className="note-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => startEdit(note)}
                    aria-label="Editar nota"
                  >
                    <IconPencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeNote(note.id)}
                    aria-label="Eliminar nota"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>

              {note.turnos_marcados.length > 0 && (
                <div className="note-refs">
                  {note.turnos_marcados.map((t) => (
                    <span key={t} className="note-ref">
                      “{preview(turns[t]?.texto ?? "")}”
                    </span>
                  ))}
                </div>
              )}

              <p className="note-text">{note.nota}</p>
            </div>
          ))}
        </div>

        <div className={`note-composer${composing ? " is-active" : ""}`}>
          {composing && (
            <p className="note-composer-title">
              {editingId ? "Editando nota" : "Nueva nota"}
            </p>
          )}

          {/* The tagged bubbles show as soon as messages are selected, before
              saving, so you see exactly what the note points at. */}
          {selected.length > 0 && (
            <div className="note-refs">
              {selected.map((t) => (
                <div key={t} className="note-ref note-ref-draft">
                  <span className="note-ref-quote">“{preview(turns[t]?.texto ?? "")}”</span>
                  <button
                    type="button"
                    className="note-ref-remove"
                    onClick={() => toggle(t)}
                    aria-label="Quitar este mensaje de la nota"
                  >
                    <IconX size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            className="textarea"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              selected.length > 0
                ? "Escribe tu feedback sobre lo seleccionado…"
                : "Escribe una nota general, o selecciona mensajes para taggearlos…"
            }
          />
          {error && <p className="form-error">{error}</p>}
          <div className="note-composer-actions">
            {composing && (
              <button
                type="button"
                className="note-act-btn"
                onClick={cancelCompose}
                aria-label="Cancelar nota"
                title="Cancelar"
              >
                <IconX size={16} />
              </button>
            )}
            <button
              type="button"
              className="note-act-btn note-act-save"
              onClick={saveNote}
              disabled={saving || !draft.trim()}
              aria-label={editingId ? "Guardar cambios" : "Guardar nota"}
              title={editingId ? "Guardar cambios" : "Guardar nota"}
            >
              <IconCheck size={16} />
            </button>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={sendToEditor}
          disabled={sending || notes.length === 0}
          style={{ width: "100%", marginTop: 10 }}
        >
          <IconSend size={15} />
          {sending ? "Enviando…" : `Enviar al Editor (${notes.length} notas)`}
        </Button>
      </aside>
    </div>
  );
}

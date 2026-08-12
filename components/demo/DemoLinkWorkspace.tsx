"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconNotes } from "@tabler/icons-react";

import type { DemoSessionDetail } from "@/lib/db/demo-sessions";
import type { DemoNoteRow } from "@/lib/db/demo-notes";
import { messagePreview } from "@/lib/adversarial-message";
import { DemoTurn } from "@/components/demo/DemoTurn";
import { NoteCard, type NoteReviewPatch } from "@/components/demo/NoteCard";
import { RoundStack, type RoundSummary } from "@/components/demo/RoundStack";
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
  const [handingOff, setHandingOff] = useState(false);
  /** Which of the visitor's conversations is on screen. Null means the last
   *  one, which is what they were doing when they stopped. */
  const [round, setRound] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRound(null);
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

  async function review(note: DemoNoteRow, patch: NoteReviewPatch) {
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
      onReviewed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la revisión.");
    } finally {
      setBusyNoteId(null);
    }
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
  // What the button would actually carry: approved, and not handed over yet by
  // this panel or by the client's inbox.
  const sendableCount = notes.filter(
    (n) => n.status === "approved" && !n.sent_to_editor_at,
  ).length;
  // note_messages carries the turns from rounds the client restarted past, so a
  // report about one of those still quotes what it was about instead of
  // pointing at a pin that is no longer on screen.
  const messagesById = new Map(
    [...session.messages, ...session.note_messages].map((m) => [m.id, m]),
  );
  // A restart starts a new conversation, not a new chapter of the same one.
  // They are grouped and shown one at a time; the rest live behind the stack.
  const byRound = new Map<number, typeof session.messages>();
  for (const m of session.messages) {
    const r = m.round ?? 1;
    byRound.set(r, [...(byRound.get(r) ?? []), m]);
  }
  const roundNumbers = [...byRound.keys()].sort((a, b) => a - b);
  const activeRound = round ?? roundNumbers.at(-1) ?? 1;
  const visible = byRound.get(activeRound) ?? [];
  const rounds: RoundSummary[] = roundNumbers.map((r) => {
    const msgs = byRound.get(r) ?? [];
    const lead = msgs.find((m) => m.role === "human");
    return {
      round: r,
      messageCount: msgs.length,
      startedAt: msgs[0]?.created_at ?? null,
      endedAt: msgs.at(-1)?.created_at ?? null,
      firstLead: lead ? messagePreview(lead.content) : null,
    };
  });

  // Only what is on screen counts as current: a report about another
  // conversation still quotes its message, tagged as belonging elsewhere.
  const currentIds = new Set(visible.map((m) => m.id));
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
        <div className="chat-toolbar">
          <RoundStack rounds={rounds} selected={activeRound} onSelect={setRound} />
        </div>
        <div className="chat-messages">
          {visible.length === 0 && (
            <p className="empty-hint">Esta persona abrió el link pero no escribió nada.</p>
          )}
          {visible.map((m) => (
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
            <NoteCard
              key={note.id}
              note={note}
              index={i + 1}
              quotes={note.message_ids.map((mid) => {
                const m = messagesById.get(mid);
                return {
                  id: mid,
                  preview: m ? messagePreview(m.content) : "(mensaje no disponible)",
                  stale: !currentIds.has(mid),
                };
              })}
              busy={busyNoteId === note.id}
              onReview={(patch) => review(note, patch)}
            />
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}

        {sendableCount > 0 && (
          <Button
            variant="primary"
            onClick={sendToEditor}
            disabled={handingOff}
            icon={<IconArrowRight size={14} />}
          >
            {handingOff
              ? "Abriendo el Editor…"
              : `Enviar ${sendableCount} al Editor`}
          </Button>
        )}
      </aside>
    </div>
  );
}

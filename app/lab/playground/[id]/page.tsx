"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconSend } from "@tabler/icons-react";
import type { DemoSessionDetail, DemoMessageRole } from "@/lib/db/demo-sessions";
import { parseTurn } from "@/lib/adversarial-message";
import { relativeTimeEs } from "@/lib/format";

/** Any special state with no readable message names itself explicitly,
 *  e.g. "El bot pasó a estado «humano» y dejó de responder." — this is
 *  exactly what a live test needs to verify (Sprint 6, decision 2). */
function emptyBotMessage(state: string | null): string {
  return state ? `El bot pasó a estado «${state}» y dejó de responder.` : "El bot no envió mensaje.";
}

function Turn({ role, content }: { role: DemoMessageRole; content: string }) {
  // The bot under test reads like the assistant; you (the lead) like the user.
  const cls = role === "bot" ? "chat-assistant" : "chat-user";
  const { message, state } = parseTurn(content);
  return (
    <div className={`chat-bubble ${cls}`}>
      <span className="chat-role">{role === "bot" ? "Bot del cliente" : "Tú (lead)"}</span>
      <div className="chat-content">
        {message ? message : <span className="chat-empty">{emptyBotMessage(state)}</span>}
      </div>
      {state && message && (
        <div className="chat-state">
          <span className="chat-state-label">Estado</span>
          <span className="chat-state-value">{state}</span>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-bubble chat-assistant">
      <span className="chat-role">Bot del cliente</span>
      <div className="chat-content chat-typing">
        Escribiendo
        <span className="typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

export default function PlaygroundSessionPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [session, setSession] = useState<DemoSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingHuman, setPendingHuman] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo-sessions/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSession(await res.json());
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

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error && !session) return <p className="form-error">{error}</p>;
  if (!session) return <p className="empty-hint">Conversación no encontrada.</p>;

  const isActive = session.status === "active";

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
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {session.messages.length === 0 && !pendingHuman && (
          <p className="empty-hint">
            Escribe el primer mensaje, como si fueras un lead real, para empezar la conversación.
          </p>
        )}
        {session.messages.map((m) => (
          <Turn key={m.id} role={m.role} content={m.content} />
        ))}
        {pendingHuman && <Turn role="human" content={pendingHuman} />}
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
              isActive ? "Escribe como un lead real…" : "Esta conversación ya no admite mensajes."
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
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowLeft, IconCopy, IconSend } from "@tabler/icons-react";
import type { ChatSessionDetail, Attachment } from "@/lib/db/chat-sessions";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { ChatMessage } from "@/components/editor/ChatMessage";
import { FileUpload } from "@/components/editor/FileUpload";
import { FinalizeButton } from "@/components/editor/FinalizeButton";
import { FinalizeCreatorButton } from "@/components/creator/FinalizeCreatorButton";

type Mode = "editor" | "creator";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  finalized: "Finalizada",
  abandoned: "Descartada",
};

const COPY_LABEL: Record<Mode, string> = {
  editor: "Copiar borrador",
  creator: "Copiar prompt",
};
const COPY_EMPTY_MESSAGE: Record<Mode, string> = {
  editor: "El borrador está vacío.",
  creator: "Aún no hay prompt construido.",
};
const COPY_DONE_MESSAGE: Record<Mode, string> = {
  editor: "Borrador copiado al portapapeles.",
  creator: "Prompt copiado al portapapeles.",
};
const EMPTY_HINT: Record<Mode, string> = {
  editor:
    "Describe el cambio que quieres hacer al prompt. Opus aplicará solo lo que pidas y te devolverá el prompt actualizado.",
  creator:
    "Sube el brief del cliente y describe el proyecto. Opus te hará un breve cuestionario con las dudas que bloquean la construcción; al responderlas, generará el prompt nuevo tomando solo la arquitectura del prompt base.",
};
const INPUT_PLACEHOLDER: Record<Mode, string> = {
  editor: "Describe el cambio… (⌘/Ctrl + Enter para enviar)",
  creator: "Describe el proyecto o responde el cuestionario… (⌘/Ctrl + Enter para enviar)",
};
const DRAFT_LABEL: Record<Mode, string> = {
  editor: "Borrador actual",
  creator: "Prompt en construcción",
};
const DRAFT_EMPTY: Record<Mode, string> = {
  editor: "El borrador aún no tiene contenido.",
  creator: "El prompt aún no se ha construido. Responde el cuestionario para generarlo.",
};

type PendingFirstMessage = { content: string; attachments: Attachment[] } | null;

/**
 * The live conversation view — shared by Editor and Creator. Used two ways:
 *  - Deep link (`/editor/[id]`, `/creator/[id]`): mounted with an existing
 *    sessionId, `onBack` does a real navigation back to the landing.
 *  - Inline (`SessionWorkspace`): mounted the instant a new session is
 *    created from the idle composer, with `autoSend` carrying the message the
 *    user already typed there so it fires immediately as turn one — the user
 *    never has to retype it. `onBack` there just flips local state, no
 *    navigation.
 */
export function SessionChat({
  sessionId,
  mode,
  onBack,
  autoSend,
}: {
  sessionId: string;
  mode: Mode;
  onBack: () => void;
  autoSend?: PendingFirstMessage;
}) {
  const [session, setSession] = useState<ChatSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSession(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la sesión.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the conversation scrolled to the latest content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session?.messages.length, pendingUser, streamingText]);

  // Per-session token usage, summed across all persisted messages.
  const tokens = useMemo(() => {
    const messages = session?.messages ?? [];
    return messages.reduce(
      (acc, m) => ({
        in: acc.in + (m.tokens_in ?? 0),
        out: acc.out + (m.tokens_out ?? 0),
      }),
      { in: 0, out: 0 },
    );
  }, [session?.messages]);

  // Creator only: the construction report is the text the assistant emits
  // outside the fenced prompt block on a construction turn.
  const report = useMemo(() => {
    if (mode !== "creator") return null;
    const messages = session?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant" || !/```/.test(m.content)) continue;
      const stripped = m.content.replace(/```[^\n]*\n[\s\S]*?```/, "").trim();
      return stripped.length > 0 ? stripped : null;
    }
    return null;
  }, [mode, session?.messages]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  const send = useCallback(
    async (explicit?: { content: string; attachments: Attachment[] }) => {
      const content = (explicit?.content ?? input).trim();
      if (!content || sending) return;
      const sent = explicit?.attachments ?? attachments;
      setSending(true);
      setError(null);
      if (!explicit) {
        setInput("");
        setAttachments([]);
      }
      setPendingUser(content);
      setPendingAttachments(sent);
      setStreamingText("");
      try {
        const res = await fetch(`/api/chat-sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            attachments: sent.length > 0 ? sent : undefined,
          }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo enviar el mensaje.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreamingText(acc);
        }
        // Re-sync from the server: canonical messages, token usage, updated draft.
        await load();
      } catch (e) {
        if (!explicit) {
          setInput(content);
          setAttachments(sent);
        }
        showToast(e instanceof Error ? e.message : "Error al enviar el mensaje.");
      } finally {
        setSending(false);
        setPendingUser(null);
        setPendingAttachments([]);
        setStreamingText(null);
      }
    },
    [sessionId, input, attachments, sending, load],
  );

  // Fire the message the user already typed on the idle composer, the instant
  // this brand-new (zero-message) session is ready — so it reads as the
  // conversation's first turn, not a message they have to send twice.
  useEffect(() => {
    if (autoSentRef.current || !autoSend || !session) return;
    if (session.messages.length > 0) return;
    autoSentRef.current = true;
    send(autoSend);
    // `send` intentionally omitted: it closes over sessionId (stable for this
    // component's lifetime) and the ref guard prevents any repeat firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, session]);

  // Leaving a session that never actually changed the prompt shouldn't clutter
  // the history: ask the server to drop it (it decides via isSessionUnchanged;
  // this is best-effort and silently ignored on failure) before navigating back.
  async function handleBack() {
    try {
      await fetch(`/api/chat-sessions/${sessionId}?onlyIfUnchanged=true`, { method: "DELETE" });
    } catch {
      // Best-effort cleanup — the session just stays in history if this fails.
    }
    onBack();
  }

  async function copyDraft() {
    const text = session?.current_draft_content;
    if (!text) {
      showToast(COPY_EMPTY_MESSAGE[mode]);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(COPY_DONE_MESSAGE[mode]);
    } catch {
      showToast("No se pudo copiar el prompt.");
    }
  }

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error && !session) return <p className="form-error">{error}</p>;
  if (!session) return <p className="empty-hint">Sesión no encontrada.</p>;

  const isAbandoned = session.status === "abandoned";
  const isActive = session.status === "active";
  const hasDraft = Boolean(session.current_draft_content?.trim());
  const title =
    mode === "editor"
      ? (session.client_name ?? "Cliente eliminado")
      : (session.client_name ?? session.title ?? "Creación nueva");

  return (
    <div>
      <div className="detail-header">
        <div>
          <button type="button" className="back-link" onClick={handleBack}>
            <IconArrowLeft size={13} /> {mode === "editor" ? "Editor" : "Creator"}
          </button>
          <h1 className="detail-title">{title}</h1>
          <div className="detail-sub">
            <span className={`session-status status-${session.status}`}>
              {STATUS_LABELS[session.status] ?? session.status}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {relativeTimeEs(session.updated_at)}
            </span>
            <span className="token-counter" title="Tokens usados en esta sesión">
              ↑ {tokens.in.toLocaleString("es-MX")} · ↓{" "}
              {tokens.out.toLocaleString("es-MX")} tokens
            </span>
          </div>
        </div>
        <div className="detail-actions">
          <Button variant="secondary" icon={<IconCopy size={14} />} onClick={copyDraft}>
            {COPY_LABEL[mode]}
          </Button>
          {isActive && mode === "editor" && (
            <FinalizeButton
              sessionId={sessionId}
              disabled={!hasDraft}
              onDone={({ version }) => {
                showToast(`Versión ${version.version_number} creada en la Biblioteca.`);
                load();
              }}
              onError={showToast}
            />
          )}
          {isActive && mode === "creator" && (
            <FinalizeCreatorButton
              sessionId={sessionId}
              disabled={!hasDraft}
              onDone={({ client, version }) => {
                showToast(`Cliente "${client.name}" creado como ${version.version_number}.`);
                load();
              }}
              onError={showToast}
            />
          )}
        </div>
      </div>

      <div className="chat-layout">
        <section className="chat-column">
          <div className="chat-messages" ref={scrollRef}>
            {session.messages.length === 0 && !pendingUser && !autoSend && (
              <p className="empty-hint">{EMPTY_HINT[mode]}</p>
            )}
            {session.messages.map((m) => (
              <ChatMessage
                key={m.id}
                role={m.role}
                content={m.content}
                attachments={m.attachments}
              />
            ))}
            {pendingUser && (
              <ChatMessage
                role="user"
                content={pendingUser}
                attachments={pendingAttachments}
              />
            )}
            {streamingText !== null && (
              <ChatMessage role="assistant" content={streamingText} streaming />
            )}
          </div>

          {!isAbandoned && (
            <FileUpload
              sessionId={sessionId}
              attachments={attachments}
              onChange={setAttachments}
              disabled={sending}
            />
          )}

          <div className="chat-input-row">
            <textarea
              className="textarea chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={isAbandoned ? "Esta sesión fue descartada." : INPUT_PLACEHOLDER[mode]}
              disabled={sending || isAbandoned}
            />
            <Button
              variant="primary"
              icon={<IconSend size={14} />}
              onClick={() => send()}
              disabled={sending || isAbandoned || !input.trim()}
            >
              {sending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </section>

        <aside className="draft-panel">
          <p className="section-label" style={{ marginBottom: 10 }}>
            {DRAFT_LABEL[mode]}
          </p>
          <pre className="draft-content">
            {session.current_draft_content?.trim()
              ? session.current_draft_content
              : DRAFT_EMPTY[mode]}
          </pre>
          {report && (
            <>
              <p className="section-label" style={{ margin: "16px 0 10px" }}>
                Reporte de construcción
              </p>
              <div className="draft-report">{report}</div>
            </>
          )}
        </aside>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

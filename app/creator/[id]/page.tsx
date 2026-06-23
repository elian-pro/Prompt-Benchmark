"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCopy, IconSend } from "@tabler/icons-react";
import type { ChatSessionDetail, Attachment } from "@/lib/db/chat-sessions";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { ChatMessage } from "@/components/editor/ChatMessage";
import { FileUpload } from "@/components/editor/FileUpload";
import { FinalizeCreatorButton } from "@/components/creator/FinalizeCreatorButton";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  finalized: "Finalizada",
  abandoned: "Descartada",
};

export default function CreatorSessionPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-sessions/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSession(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la sesión.");
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  // The construction report is the text the assistant emits outside the fenced
  // prompt block on a construction turn. Pull it from the latest assistant
  // message that contains a code block; questionnaire turns have none.
  const report = useMemo(() => {
    const messages = session?.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant" || !/```/.test(m.content)) continue;
      const stripped = m.content.replace(/```[^\n]*\n[\s\S]*?```/, "").trim();
      return stripped.length > 0 ? stripped : null;
    }
    return null;
  }, [session?.messages]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    const sent = attachments;
    setSending(true);
    setError(null);
    setInput("");
    setAttachments([]);
    setPendingUser(content);
    setPendingAttachments(sent);
    setStreamingText("");
    try {
      const res = await fetch(`/api/chat-sessions/${id}/messages`, {
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
      setInput(content);
      setAttachments(sent);
      showToast(e instanceof Error ? e.message : "Error al enviar el mensaje.");
    } finally {
      setSending(false);
      setPendingUser(null);
      setPendingAttachments([]);
      setStreamingText(null);
    }
  }

  async function copyDraft() {
    const text = session?.current_draft_content;
    if (!text) {
      showToast("Aún no hay prompt construido.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Prompt copiado al portapapeles.");
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

  return (
    <div>
      <div className="detail-header">
        <div>
          <Link href="/creator" className="back-link">
            <IconArrowLeft size={13} /> Creator
          </Link>
          <h1 className="detail-title">
            {session.client_name ?? session.title ?? "Creación nueva"}
          </h1>
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
            Copiar prompt
          </Button>
          {isActive && (
            <FinalizeCreatorButton
              sessionId={id}
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
            {session.messages.length === 0 && !pendingUser && (
              <p className="empty-hint">
                Sube el brief del cliente y describe el proyecto. Opus te hará
                un breve cuestionario con las dudas que bloquean la construcción;
                al responderlas, generará el prompt nuevo tomando solo la
                arquitectura del prompt base.
              </p>
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
              sessionId={id}
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
              placeholder={
                isAbandoned
                  ? "Esta sesión fue descartada."
                  : "Describe el proyecto o responde el cuestionario… (⌘/Ctrl + Enter para enviar)"
              }
              disabled={sending || isAbandoned}
            />
            <Button
              variant="primary"
              icon={<IconSend size={14} />}
              onClick={send}
              disabled={sending || isAbandoned || !input.trim()}
            >
              {sending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </section>

        <aside className="draft-panel">
          <p className="section-label" style={{ marginBottom: 10 }}>
            Prompt en construcción
          </p>
          <pre className="draft-content">
            {session.current_draft_content?.trim()
              ? session.current_draft_content
              : "El prompt aún no se ha construido. Responde el cuestionario para generarlo."}
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

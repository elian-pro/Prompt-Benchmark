"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconPaperclip, IconSend, IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import type { ChatSessionListItem, Attachment } from "@/lib/db/chat-sessions";
import type { ClientDetail } from "@/lib/db/clients";
import { relativeTimeEs } from "@/lib/format";
import { getGreeting, TEAM_NAME } from "@/lib/greeting";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ClientChip, type ClientChipValue } from "@/components/sessions/ClientChip";
import { DeleteSessionModal } from "@/components/sessions/DeleteSessionModal";
import { ATTACHMENT_ACCEPT, isAcceptedFile, uploadAttachment } from "@/lib/attachments";

type Mode = "editor" | "creator";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  finalized: "Finalizada",
  abandoned: "Descartada",
};

// Decorative welcome chips only — non-interactive, just to set the tone.
const INSPIRATION: Record<Mode, string[]> = {
  editor: [
    "Ajustar el tono del bot",
    "Cambiar una cifra o dato",
    "Reforzar la calificación de leads",
    "Pulir el saludo inicial",
  ],
  creator: [
    "Construir desde un brief",
    "Adaptar un flujo a otro giro",
    "Un bot de bienvenida nuevo",
    "Calificar leads desde cero",
  ],
};

const PLACEHOLDER: Record<Mode, string> = {
  editor: "Describe el cambio que quieres hacer al prompt…",
  creator: "Describe el proyecto o pega el brief…",
};

type FirstMessage = { content: string; attachments: Attachment[] };

async function fetchClientDetail(id: string): Promise<ClientDetail> {
  const res = await fetch(`/api/clients/${id}`);
  if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cargar el cliente.");
  return res.json();
}

/**
 * The Editor/Creator landing: greeting, an inline composer (client chip +
 * attach + textarea + send — the same bar for both picking context and
 * writing the first message), inspiration chips, and history. Sending here
 * creates the session and hands off to SessionChat in place — never a route
 * change.
 */
export function IdleComposer({
  mode,
  onStarted,
  onResumeHistory,
}: {
  mode: Mode;
  onStarted: (sessionId: string, firstMessage: FirstMessage) => void;
  onResumeHistory: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Computed after mount so the random/time-based greeting doesn't mismatch SSR.
  const [greeting, setGreeting] = useState("");

  const [clientValue, setClientValue] = useState<ClientChipValue>(null);
  const [text, setText] = useState("");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionListItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setGreeting(getGreeting(new Date()));
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/chat-sessions?type=${mode}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSessions(await res.json());
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Error al cargar las sesiones.");
    } finally {
      setHistoryLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const canStart = mode === "editor" ? clientValue?.kind === "client" : clientValue !== null;
  const canSend = canStart && text.trim().length > 0 && !starting;

  function stageFiles(files: File[]) {
    const accepted = files.filter(isAcceptedFile);
    if (accepted.length < files.length) {
      setError("Algunos archivos no son compatibles (usa texto, PDF o imagen).");
    }
    if (accepted.length > 0) setStagedFiles((prev) => [...prev, ...accepted]);
  }
  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    if (files.length > 0) stageFiles(files);
  }
  // Drop files anywhere on the composer card — staged like the "Adjuntar" button.
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (starting) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) stageFiles(files);
  }
  function removeStaged(file: File) {
    setStagedFiles((prev) => prev.filter((f) => f !== file));
  }

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }

  async function start() {
    if (!canSend) return;
    setStarting(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "editor") {
        if (clientValue?.kind !== "client") throw new Error("Selecciona un cliente.");
        const detail = await fetchClientDetail(clientValue.id);
        const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
        if (!baseVersionId) throw new Error("El cliente no tiene ninguna versión base.");
        body = { clientId: clientValue.id, baseVersionId };
      } else if (clientValue?.kind === "client") {
        const detail = await fetchClientDetail(clientValue.id);
        const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
        if (!baseVersionId) throw new Error("El prompt de referencia no tiene ninguna versión.");
        body = { type: "creator", baseVersionId, title: `Basado en ${detail.name}` };
      } else {
        body = { type: "creator" };
      }

      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo crear la sesión.");
      const created = await res.json();
      const sessionId = created.id as string;

      // Upload staged files now that a session exists to attach them to.
      // Best-effort: keep whatever succeeds and surface the rest as an error,
      // same resilience as the in-conversation attach flow.
      const attachments: Attachment[] = [];
      for (const file of stagedFiles) {
        try {
          attachments.push(await uploadAttachment(sessionId, file));
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo subir un archivo.");
        }
      }

      onStarted(sessionId, { content: text.trim(), attachments });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setStarting(false);
    }
  }

  return (
    <div className="session-landing">
      <section className="landing-hero">
        <h1 className="landing-greeting">
          {greeting
            ? greeting
                .split(TEAM_NAME)
                .flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <span key={i} className="greeting-team">
                          {TEAM_NAME}
                        </span>,
                        part,
                      ],
                )
            : " "}
        </h1>

        <div
          className={`idle-composer${dragging ? " composer-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!starting) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="idle-composer-toprow">
            <ClientChip mode={mode} value={clientValue} onChange={setClientValue} />
            <button
              type="button"
              className="attach-trigger"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconPaperclip size={13} />
              Adjuntar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="visually-hidden"
              onChange={onFilesPicked}
            />
            {stagedFiles.map((f) => (
              <span key={f.name + f.size} className="attachment-chip">
                {f.name}
                <button
                  type="button"
                  className="attachment-remove"
                  onClick={() => removeStaged(f)}
                  aria-label={`Quitar ${f.name}`}
                >
                  <IconX size={11} />
                </button>
              </span>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            className="idle-composer-input"
            rows={1}
            value={text}
            onChange={onTextChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                start();
              }
            }}
            placeholder={PLACEHOLDER[mode]}
            disabled={starting}
          />

          <div className="idle-composer-footrow">
            <span className="idle-composer-hint">
              {!canStart
                ? mode === "editor"
                  ? "Elige un cliente para empezar"
                  : "Elige una referencia o empieza desde cero"
                : !text.trim()
                  ? "Escribe el primer mensaje"
                  : ""}
            </span>
            <button
              type="button"
              className="idle-send-btn"
              onClick={start}
              disabled={!canSend}
              aria-label="Enviar"
            >
              <IconSend size={14} />
            </button>
          </div>

          {dragging && (
            <div className="composer-drop-hint">
              <IconPaperclip size={16} />
              Suelta para adjuntar
            </div>
          )}
        </div>

        {error && (
          <p className="form-error" style={{ marginTop: 4 }}>
            {error}
          </p>
        )}

        <div className="landing-inspiration" aria-hidden="true">
          {INSPIRATION[mode].map((t) => (
            <span key={t} className="inspiration-chip">
              <IconSparkles size={13} stroke={1.5} />
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="landing-history">
        <div className="landing-history-head">
          <span className="history-chip">Historial · {sessions.length}</span>
        </div>

        {historyLoading && <SkeletonRows count={3} />}
        {historyError && <p className="form-error">{historyError}</p>}

        {!historyLoading && !historyError && sessions.length === 0 && (
          <p className="empty-hint">
            Aún no hay sesiones. Selecciona un cliente para empezar.
          </p>
        )}

        {!historyLoading && !historyError && sessions.length > 0 && (
          <div className="session-list">
            {sessions.map((s) => {
              const primary =
                mode === "editor"
                  ? (s.client_name ?? "Cliente eliminado")
                  : (s.client_name ?? s.title ?? "Creación nueva");
              const showTitle =
                mode === "editor" ? Boolean(s.title) : Boolean(s.client_name && s.title);
              return (
                <div
                  key={s.id}
                  className="session-item"
                  onClick={() => onResumeHistory(s.id)}
                >
                  <span className="session-main">
                    <span className="session-client">{primary}</span>
                    {showTitle && <span className="session-title">{s.title}</span>}
                  </span>
                  <span className="session-meta">
                    <span className={`session-status status-${s.status}`}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <span className="muted">{relativeTimeEs(s.updated_at)}</span>
                    <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Eliminar"
                        aria-label={`Eliminar sesión de ${primary}`}
                        onClick={() => setDeleteTarget(s)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {deleteTarget && (
        <DeleteSessionModal
          session={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={() => {
            setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

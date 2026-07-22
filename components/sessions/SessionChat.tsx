"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconBug,
  IconChevronDown,
  IconCopy,
  IconFileText,
  IconPaperclip,
  IconPencil,
  IconReplace,
  IconRocket,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import type { ChatSessionDetail, Attachment, MessageAnswer } from "@/lib/db/chat-sessions";
import type { ComposerSettings } from "@/lib/db/composer-settings";
import { isAcceptedFile, uploadAttachment } from "@/lib/attachments";
import { nextPasteName } from "@/lib/smart-paste";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FindReplace } from "@/components/ui/FindReplace";
import { N8nSyncModal } from "@/components/library/N8nSyncModal";
import { ChatMessage } from "@/components/editor/ChatMessage";
import { FileUpload } from "@/components/editor/FileUpload";
import { FinalizeButton } from "@/components/editor/FinalizeButton";
import { FinalizeCreatorButton } from "@/components/creator/FinalizeCreatorButton";

type Mode = "editor" | "creator";

/** One recorded chat failure, kept so the user can review it after the toast
 *  is gone. `detail` is the raw technical string (HTTP body or stack) when it
 *  adds anything over the human message. */
type ErrorEntry = {
  id: number;
  at: string;
  action: string;
  message: string;
  detail?: string;
};

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
  editor: "Describe el cambio…",
  creator: "Describe el proyecto o responde el cuestionario…",
};
const DRAFT_TOGGLE: Record<Mode, string> = {
  editor: "Ver borrador",
  creator: "Ver prompt",
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
 *
 * Layout continuity is the point: same centered 680px column and the same
 * rounded composer card as the welcome screen, so starting a conversation
 * reads as the greeting giving way to messages — never as a page change. The
 * working draft lives in a slide-over drawer instead of a second column.
 *
 * `initialDraft` is the other pre-fill path (Sprint 6, T4): a Playground
 * "Enviar al Editor" handoff lands here with a composed first message that
 * fills the composer WITHOUT sending it — unlike `autoSend`, the user still
 * has to review, maybe edit, and hit send themselves (decision 6).
 */
export function SessionChat({
  sessionId,
  mode,
  onBack,
  autoSend,
  initialDraft,
}: {
  sessionId: string;
  mode: Mode;
  onBack: () => void;
  autoSend?: PendingFirstMessage;
  initialDraft?: string;
}) {
  const [session, setSession] = useState<ChatSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Smart Paste (Sprint 15): shared team setting fetched once, and the
  // original text behind any pending paste-generated attachment (so its chip
  // can be expanded or converted back to plain text before the message is
  // sent). Attachments from already-sent messages never appear here.
  const [composerSettings, setComposerSettings] = useState<ComposerSettings | null>(null);
  const [smartPasteText, setSmartPasteText] = useState<Record<string, string>>({});
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // True while any attachment (attach button, drag-drop, or Smart Paste) is
  // still uploading, so `send` can refuse to fire until it lands in
  // `attachments`. Otherwise a fast send races the upload and the message
  // goes out with no file at all.
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Error log: the toast is fleeting, so every failure is also kept here and
  // surfaced by a bug button (with a red count badge) that opens a modal, so
  // the user can read a "network error" and its technical detail at leisure.
  const [errorLog, setErrorLog] = useState<ErrorEntry[]>([]);
  const [errorLogOpen, setErrorLogOpen] = useState(false);
  const errorIdRef = useRef(0);
  const [draftOpen, setDraftOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Whether the chat is scrolled near the bottom (hides the jump button).
  const [atBottom, setAtBottom] = useState(true);

  // Manual draft editing (Editor only): edit the working draft by hand, no
  // AI turn. draftInput holds the in-progress text; findOpen toggles the
  // find/replace bar over it.
  const [draftEditing, setDraftEditing] = useState(false);
  const [draftInput, setDraftInput] = useState("");
  const [draftFindOpen, setDraftFindOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);
  // The draft the user has acknowledged (by opening the drawer). A newer draft
  // than this lights the "NEW" badge on "Ver borrador".
  const [seenDraft, setSeenDraft] = useState<string | null>(null);
  const seenInitRef = useRef(false);
  // The version just created by "Finalizar edición", so the Editor can offer
  // to promote it (and sync n8n) without leaving for the Library.
  const [finalizedVersion, setFinalizedVersion] = useState<
    { id: string; number: string } | null
  >(null);
  const [promoting, setPromoting] = useState(false);
  const [syncTarget, setSyncTarget] = useState<
    { versionId: string; versionNumber: string; versionContent: string } | null
  >(null);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    // Only the first load blanks the screen with a spinner; refreshes after a
    // reply are silent so the chat doesn't flash to a loading state.
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      const data: ChatSessionDetail = await res.json();
      setSession(data);
      // On first load, treat the existing draft as already seen (no badge).
      if (!seenInitRef.current) {
        seenInitRef.current = true;
        setSeenDraft(data.current_draft_content ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la sesión.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Smart Paste settings are shared team-wide (no per-user accounts), so a
  // single fetch on mount is enough; a value never changes mid-session.
  useEffect(() => {
    let alive = true;
    fetch("/api/composer-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ComposerSettings | null) => {
        if (alive && data) setComposerSettings(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Keep the conversation pinned to the latest content, but only while the
  // user is already near the bottom, so scrolling up to read isn't yanked back
  // down by streaming output.
  useEffect(() => {
    if (atBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session?.messages.length, pendingUser, streamingText, atBottom]);

  function onStreamScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 80);
  }
  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  // Escape steps out one layer at a time: the find bar first (if open), then
  // the drawer. Otherwise Escape inside find/replace would close the whole
  // drawer instead of just the search.
  useEffect(() => {
    if (!draftOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (draftFindOpen) setDraftFindOpen(false);
      else setDraftOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draftOpen, draftFindOpen]);

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

  // Resolve which assistant options blocks were answered, keyed by the
  // assistant message id stored inside each answer (not by position), so a
  // block renders its collapsed read-only summary once answered.
  const answeredBySource = useMemo(() => {
    const map = new Map<string, MessageAnswer>();
    for (const m of session?.messages ?? []) {
      if (m.answer?.sourceMessageId) map.set(m.answer.sourceMessageId, m.answer);
    }
    return map;
  }, [session?.messages]);

  // The last message in the list: only its (unanswered) options block is live.
  const lastMessageId = session?.messages.at(-1)?.id ?? null;

  function showToast(message: string, durationMs = 2500) {
    setToast(message);
    window.setTimeout(() => setToast(null), durationMs);
  }

  // Reports a failure: shows the fleeting toast AND records it in the error log
  // so it stays consultable via the bug button. `action` names what failed
  // (e.g. "Enviar mensaje"); `err` can be an Error, a string, or anything.
  function reportError(action: string, err: unknown, fallback: string) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
    const rawDetail =
      err instanceof Error
        ? (err.stack ?? err.message)
        : typeof err === "string"
          ? err
          : (() => {
              try {
                return JSON.stringify(err);
              } catch {
                return String(err);
              }
            })();
    const entry: ErrorEntry = {
      id: ++errorIdRef.current,
      at: new Date().toISOString(),
      action,
      message,
      detail: rawDetail && rawDetail !== message ? rawDetail : undefined,
    };
    setErrorLog((prev) => [entry, ...prev]);
    showToast(message);
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
  }

  // Single source of truth for the composer's auto-grow height. Runs after the
  // new value is committed to the DOM but before paint, so it measures the real
  // content height for every `input` change, whether typed or set
  // programmatically (Playground handoff pre-fill, paste restore). Doing this in
  // a rAF right after setInput used to race the re-render and measure the empty
  // textarea, leaving a pre-filled draft stuck collapsed until the first keystroke.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const send = useCallback(
    async (explicit?: { content: string; attachments: Attachment[]; answer?: MessageAnswer }) => {
      const content = (explicit?.content ?? input).trim();
      if (!content || sending || attachmentsBusy) return;
      const sent = explicit?.attachments ?? attachments;
      const answer = explicit?.answer;
      setSending(true);
      setError(null);
      if (!explicit) {
        setInput("");
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
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
            answer,
          }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo enviar el mensaje.");
        }
        // NDJSON stream: {type:"text", text} deltas, then one final
        // {type:"done", truncated, draftBroken} — see the route's docstring.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let buffer = "";
        let truncated = false;
        let draftBroken = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line);
            if (evt.type === "text") {
              acc += evt.text;
              setStreamingText(acc);
            } else if (evt.type === "done") {
              truncated = evt.truncated;
              draftBroken = evt.draftBroken;
            }
          }
        }
        // Re-sync from the server: canonical messages, token usage, updated
        // draft. Silent so the chat doesn't flash to the loading state.
        await load({ silent: true });

        if (draftBroken) {
          showToast(
            "La respuesta se cortó antes de terminar el prompt: el borrador NO se actualizó. Sube «Máx tokens» en Configuración → Asignación de roles y vuelve a intentarlo.",
            7000,
          );
        } else if (truncated) {
          showToast(
            "La respuesta se cortó por el límite de tokens. Si falta contenido, sube «Máx tokens» en Configuración.",
            6000,
          );
        }
      } catch (e) {
        if (!explicit) {
          setInput(content);
          setAttachments(sent);
        }
        reportError("Enviar mensaje", e, "Error al enviar el mensaje.");
      } finally {
        setSending(false);
        setPendingUser(null);
        setPendingAttachments([]);
        setStreamingText(null);
      }
    },
    [sessionId, input, attachments, sending, attachmentsBusy, load],
  );

  // Confirming an options block sends its human-readable summary as a normal
  // user message plus the structured selection for persistence.
  const onSubmitOptions = useCallback(
    (answerText: string, answer: MessageAnswer) => {
      void send({ content: answerText, attachments: [], answer });
    },
    [send],
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

  // Pre-fill (not send) the composer with a Playground handoff's composed
  // message, the instant this brand-new session is ready, so the user lands
  // looking at exactly what they need to review before sending.
  const initialDraftAppliedRef = useRef(false);
  useEffect(() => {
    if (initialDraftAppliedRef.current || !initialDraft || !session) return;
    if (session.messages.length > 0) return;
    initialDraftAppliedRef.current = true;
    setInput(initialDraft);
    // Height is handled by the auto-grow layout effect (keyed on `input`); here
    // we only move focus into the pre-filled composer, once it has rendered.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [initialDraft, session]);

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

  // Drop files onto the composer: upload immediately and attach to the next
  // message (the in-conversation counterpart to the "Adjuntar" button).
  async function onDropFiles(files: File[]) {
    if (sending) return;
    const accepted = files.filter(isAcceptedFile);
    if (accepted.length < files.length) {
      showToast("Algunos archivos no son compatibles (usa texto, PDF o imagen).");
    }
    setAttachmentsBusy(true);
    const added: Attachment[] = [];
    try {
      for (const file of accepted) {
        try {
          added.push(await uploadAttachment(sessionId, file));
        } catch (e) {
          reportError("Subir archivo", e, "No se pudo subir el archivo.");
        }
      }
      if (added.length > 0) {
        setAttachments((prev) => [...prev, ...added]);
        showToast(
          added.length === 1
            ? `${added[0].filename} listo para enviar.`
            : `${added.length} archivos listos para enviar.`,
        );
      }
    } finally {
      setAttachmentsBusy(false);
    }
  }

  // Inserts `text` at the composer's current cursor position (falls back to
  // appending when the textarea ref isn't available). Used both to restore a
  // paste that failed to upload, and to undo a Smart Paste conversion.
  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setInput((prev) => prev + text);
      return;
    }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + text + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    });
  }

  // Smart Paste (Sprint 15): intercepts a paste into the composer. Below the
  // team's configured threshold, nothing happens here and the browser's
  // default paste goes through unmodified. At or above it, the raw text never
  // touches the input: it becomes a removable .txt attachment instead, using
  // the exact same upload pipeline as a manually attached file.
  async function onComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!composerSettings?.smart_paste_enabled || isAbandoned) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text || text.length < composerSettings.smart_paste_threshold) return;
    e.preventDefault();

    const existingNames = [
      ...(session?.messages.flatMap((m) => (m.attachments ?? []).map((a) => a.filename)) ?? []),
      ...attachments.map((a) => a.filename),
    ];
    const filename = nextPasteName(existingNames);

    setAttachmentsBusy(true);
    try {
      const file = new File([text], filename, { type: "text/plain" });
      const attachment = await uploadAttachment(sessionId, file);
      setAttachments((prev) => [...prev, attachment]);
      setSmartPasteText((prev) => ({ ...prev, [attachment.uploadId]: text }));
    } catch {
      // Never silently lose the user's pasted content: fall back to a normal
      // insert if the upload fails.
      showToast("No se pudo convertir el texto pegado en adjunto; se insertó tal cual.");
      insertAtCursor(text);
    } finally {
      setAttachmentsBusy(false);
    }
  }

  // Undoes a Smart Paste conversion: removes the attachment and puts its
  // original text back in the composer, exactly where "eliminar" would leave
  // it plus the text. Only ever called for chips present in smartPasteText.
  async function revertSmartPaste(att: Attachment) {
    const text = smartPasteText[att.uploadId];
    setAttachments((prev) => prev.filter((a) => a.uploadId !== att.uploadId));
    setSmartPasteText((prev) => {
      const { [att.uploadId]: _omit, ...rest } = prev;
      return rest;
    });
    if (text) insertAtCursor(text);
    try {
      await fetch(`/api/uploads/${att.uploadId}`, { method: "DELETE" });
    } catch {
      // Ignore: the TTL cron is the backstop.
    }
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

  // Enter manual edit mode: seed the editable text from the current draft.
  function startDraftEdit() {
    setDraftInput(session?.current_draft_content ?? "");
    setDraftEditing(true);
  }
  function cancelDraftEdit() {
    setDraftEditing(false);
    setDraftFindOpen(false);
  }
  function closeDrawer() {
    setDraftOpen(false);
    setDraftEditing(false);
    setDraftFindOpen(false);
  }

  // Persist a hand-edited draft (no AI turn). Updates the session in place so
  // "Finalizar edición" commits exactly what's shown, then leaves edit mode.
  async function saveDraftEdit() {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftContent: draftInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar el borrador.");
      }
      setSession((s) => (s ? { ...s, current_draft_content: draftInput } : s));
      setDraftEditing(false);
      setDraftFindOpen(false);
      showToast("Borrador guardado.");
    } catch (e) {
      reportError("Guardar borrador", e, "No se pudo guardar el borrador.");
    } finally {
      setSavingDraft(false);
    }
  }

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error && !session) return <p className="form-error">{error}</p>;
  if (!session) return <p className="empty-hint">Sesión no encontrada.</p>;

  const isAbandoned = session.status === "abandoned";
  const isActive = session.status === "active";
  const hasDraft = Boolean(session.current_draft_content?.trim());
  // A draft newer than what the user last opened lights the NEW badge.
  const hasNewDraft = hasDraft && session.current_draft_content !== seenDraft;

  function openDraft() {
    setSeenDraft(session?.current_draft_content ?? null);
    setDraftOpen(true);
  }

  // Promotes the just-finalized version to production and, if the client has
  // n8n bindings, opens the same sync modal the Library uses.
  async function promoteFromEditor() {
    if (!finalizedVersion || !session?.client_id || promoting) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/versions/${finalizedVersion.id}/promote`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo promover.");
      showToast(`${finalizedVersion.number} marcada como producción.`);
      const bRes = await fetch(`/api/clients/${session.client_id}/n8n-bindings`);
      if (bRes.ok) {
        const bindings: { mode: string; sync_enabled: boolean }[] = await bRes.json();
        if (bindings.some((b) => (b.mode === "api" && b.sync_enabled) || b.mode === "manual")) {
          setSyncTarget({
            versionId: finalizedVersion.id,
            versionNumber: finalizedVersion.number,
            versionContent: session.current_draft_content ?? "",
          });
        }
      }
    } catch (e) {
      reportError("Promover a producción", e, "Error al promover.");
    } finally {
      setPromoting(false);
    }
  }
  const title =
    mode === "editor"
      ? (session.client_name ?? "Cliente eliminado")
      : (session.client_name ?? session.title ?? "Creación nueva");

  return (
    <div className="chat-shell">
      <div className="chat-topbar">
        <div className="chat-topbar-left">
          <button type="button" className="back-link" onClick={handleBack}>
            <IconArrowLeft size={13} /> {mode === "editor" ? "Editor" : "Creator"}
          </button>
          <span className="chat-topbar-title">{title}</span>
          <span className={`session-status status-${session.status}`}>
            {STATUS_LABELS[session.status] ?? session.status}
          </span>
          <span className="token-counter" title="Tokens usados en esta sesión">
            ↑ {tokens.in.toLocaleString("es-MX")} · ↓{" "}
            {tokens.out.toLocaleString("es-MX")} tokens
          </span>
          {session.source_demo_session_id && (
            <Link
              href={`/lab/playground/${session.source_demo_session_id}`}
              className="playground-source-link"
            >
              Desde Playground
            </Link>
          )}
        </div>
        <div className="chat-topbar-actions">
          <span className="draft-toggle-wrap">
            <Button variant="secondary" icon={<IconFileText size={14} />} onClick={openDraft}>
              {DRAFT_TOGGLE[mode]}
            </Button>
            {hasNewDraft && <span className="draft-new-badge">NEW</span>}
          </span>
          {isActive && mode === "editor" && (
            <FinalizeButton
              sessionId={sessionId}
              disabled={!hasDraft}
              onDone={({ version }) => {
                setFinalizedVersion({ id: version.id, number: version.version_number });
                showToast(`Versión ${version.version_number} creada en la Biblioteca.`);
                load({ silent: true });
              }}
              onError={(msg) => reportError("Finalizar versión", msg, msg)}
            />
          )}
          {mode === "editor" && finalizedVersion && (
            <Button
              variant="primary"
              icon={<IconRocket size={14} />}
              onClick={promoteFromEditor}
              disabled={promoting}
            >
              {promoting ? "Promoviendo…" : "Promover a producción"}
            </Button>
          )}
          {isActive && mode === "creator" && (
            <FinalizeCreatorButton
              sessionId={sessionId}
              disabled={!hasDraft}
              onDone={({ client, version }) => {
                showToast(`Cliente "${client.name}" creado como ${version.version_number}.`);
                load({ silent: true });
              }}
              onError={(msg) => reportError("Crear cliente", msg, msg)}
            />
          )}
        </div>
      </div>

      <div className="chat-stream" ref={scrollRef} onScroll={onStreamScroll}>
        <div className="chat-stream-inner">
          {session.messages.length === 0 && !pendingUser && !autoSend && (
            <p className="empty-hint">{EMPTY_HINT[mode]}</p>
          )}
          {session.messages.map((m) => (
            <ChatMessage
              key={m.id}
              role={m.role}
              content={m.content}
              attachments={m.attachments}
              mode={mode}
              messageId={m.id}
              answeredSelection={answeredBySource.get(m.id) ?? null}
              interactive={
                session.status === "active" &&
                m.id === lastMessageId &&
                !answeredBySource.has(m.id)
              }
              onSubmitOptions={onSubmitOptions}
            />
          ))}
          {pendingUser && (
            <ChatMessage
              role="user"
              content={pendingUser}
              attachments={pendingAttachments}
              mode={mode}
            />
          )}
          {streamingText !== null && (
            <ChatMessage role="assistant" content={streamingText} streaming mode={mode} />
          )}
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          className="chat-jump-btn"
          onClick={scrollToBottom}
          aria-label="Bajar al final"
          title="Bajar al final"
        >
          <IconChevronDown size={18} />
        </button>
      )}

      <div className="chat-composer-zone">
        <div
          className={`idle-composer chat-composer${dragging ? " composer-dragging" : ""}`}
          onDragOver={(e) => {
            if (isAbandoned) return;
            e.preventDefault();
            if (!sending) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            if (isAbandoned) return;
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) onDropFiles(files);
          }}
        >
          {!isAbandoned && (
            <FileUpload
              sessionId={sessionId}
              attachments={attachments}
              onChange={setAttachments}
              disabled={sending}
              pastedTextByUploadId={smartPasteText}
              onRevertPaste={revertSmartPaste}
              onBusyChange={setAttachmentsBusy}
            />
          )}
          <textarea
            ref={textareaRef}
            className="idle-composer-input"
            rows={1}
            value={input}
            onChange={onInputChange}
            onPaste={onComposerPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isAbandoned ? "Esta sesión fue descartada." : INPUT_PLACEHOLDER[mode]}
            disabled={sending || isAbandoned}
          />
          <div className="idle-composer-footrow">
            <span className="idle-composer-hint">
              {sending
                ? "Enviando…"
                : attachmentsBusy
                  ? "Subiendo archivo…"
                  : "⌘/Ctrl + Enter para enviar"}
            </span>
            <button
              type="button"
              className="idle-send-btn"
              onClick={() => send()}
              disabled={sending || isAbandoned || attachmentsBusy || !input.trim()}
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
      </div>

      {draftOpen && (
        <>
          <div
            className="drawer-overlay"
            onClick={() => {
              // Don't discard an in-progress manual edit on an accidental
              // backdrop click — require Cancelar/Guardar.
              if (!draftEditing) closeDrawer();
            }}
          />
          <aside className="draft-drawer" role="dialog" aria-label={DRAFT_LABEL[mode]}>
            <div className="draft-drawer-head">
              <p className="section-label" style={{ margin: 0 }}>
                {draftEditing ? "Editar a mano" : DRAFT_LABEL[mode]}
              </p>
              <div className="draft-drawer-actions">
                {draftEditing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<IconReplace size={14} />}
                    onClick={() => setDraftFindOpen((v) => !v)}
                  >
                    Buscar y reemplazar
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" icon={<IconCopy size={14} />} onClick={copyDraft}>
                      {COPY_LABEL[mode]}
                    </Button>
                    {mode === "editor" && isActive && (
                      <Button
                        variant="secondary"
                        icon={<IconPencil size={14} />}
                        onClick={startDraftEdit}
                      >
                        Editar a mano
                      </Button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={closeDrawer}
                      aria-label="Cerrar"
                    >
                      <IconX size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {draftEditing ? (
              <>
                {draftFindOpen && (
                  <FindReplace
                    textareaRef={draftTextareaRef}
                    value={draftInput}
                    onChange={setDraftInput}
                    onClose={() => setDraftFindOpen(false)}
                    onReplaceAll={(count) =>
                      showToast(`${count} ${count === 1 ? "reemplazo" : "reemplazos"} hechos.`)
                    }
                  />
                )}
                <textarea
                  ref={draftTextareaRef}
                  className="draft-edit-textarea"
                  value={draftInput}
                  onChange={(e) => setDraftInput(e.target.value)}
                  placeholder="Escribe o pega aquí el prompt…"
                />
                <p className="field-hint" style={{ margin: 0 }}>
                  Edición manual, sin IA. Guarda para actualizar el borrador.
                </p>
                <div className="draft-edit-actions">
                  <Button variant="ghost" onClick={cancelDraftEdit} disabled={savingDraft}>
                    Cancelar
                  </Button>
                  <Button variant="primary" onClick={saveDraftEdit} disabled={savingDraft}>
                    {savingDraft ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <pre className="draft-content">
                  {session.current_draft_content?.trim()
                    ? session.current_draft_content
                    : DRAFT_EMPTY[mode]}
                </pre>
                {mode === "editor" && finalizedVersion && (
                  <div className="draft-edit-actions">
                    <Button
                      variant="primary"
                      icon={<IconRocket size={14} />}
                      onClick={promoteFromEditor}
                      disabled={promoting}
                    >
                      {promoting ? "Promoviendo…" : "Promover a producción"}
                    </Button>
                  </div>
                )}
                {report && (
                  <>
                    <p className="section-label" style={{ margin: "4px 0 0" }}>
                      Reporte de construcción
                    </p>
                    <div className="draft-report">{report}</div>
                  </>
                )}
              </>
            )}
          </aside>
        </>
      )}

      {syncTarget && session.client_id && (
        <N8nSyncModal
          clientId={session.client_id}
          versionId={syncTarget.versionId}
          versionNumber={syncTarget.versionNumber}
          versionContent={syncTarget.versionContent}
          onClose={() => setSyncTarget(null)}
          onDone={({ pushed, failed }) => {
            if (pushed > 0 && failed === 0) showToast(`Sincronizado con n8n (${pushed}).`);
            else if (failed > 0) showToast(`Sincronización con ${failed} error(es).`);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {errorLog.length > 0 && (
        <button
          type="button"
          className="error-bug-btn"
          onClick={() => setErrorLogOpen(true)}
          aria-label={`Ver errores (${errorLog.length})`}
          title="Ver errores"
        >
          <IconBug size={18} />
          <span className="error-bug-badge">{errorLog.length}</span>
        </button>
      )}

      <Modal
        open={errorLogOpen}
        onClose={() => setErrorLogOpen(false)}
        title={`Errores de esta sesión (${errorLog.length})`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setErrorLog([]);
                setErrorLogOpen(false);
              }}
            >
              Limpiar
            </Button>
            <Button variant="secondary" onClick={() => setErrorLogOpen(false)}>
              Cerrar
            </Button>
          </>
        }
      >
        <div className="error-log-list">
          {errorLog.map((e) => (
            <div key={e.id} className="error-log-item">
              <div className="error-log-head">
                <span className="error-log-action">{e.action}</span>
                <span className="error-log-time">
                  {new Date(e.at).toLocaleTimeString("es-MX")}
                </span>
              </div>
              <p className="error-log-message">{e.message}</p>
              {e.detail && <pre className="error-log-detail">{e.detail}</pre>}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

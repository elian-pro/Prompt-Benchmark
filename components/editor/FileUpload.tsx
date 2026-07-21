"use client";

import { useRef, useState } from "react";
import { IconArrowBackUp, IconChevronDown, IconPaperclip, IconX } from "@tabler/icons-react";
import type { Attachment } from "@/lib/db/chat-sessions";
import { ATTACHMENT_ACCEPT, uploadAttachment } from "@/lib/attachments";

/**
 * Attaches files to the next message: uploads each to Storage and tracks the
 * returned references. Removing a chip deletes the file from Storage too.
 *
 * `pastedTextByUploadId` marks which chips came from Smart Paste (Sprint 15):
 * those get an expand toggle (read-only preview of the original text) and a
 * "convertir a texto plano" action, on top of the normal remove button.
 * Manually attached files never have an entry here, so they stay exactly as
 * before: a plain filename chip with just remove.
 */
export function FileUpload({
  sessionId,
  attachments,
  onChange,
  disabled,
  pastedTextByUploadId,
  onRevertPaste,
}: {
  sessionId: string;
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
  pastedTextByUploadId?: Record<string, string>;
  onRevertPaste?: (attachment: Attachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    const added: Attachment[] = [];
    try {
      for (const file of files) {
        added.push(await uploadAttachment(sessionId, file));
      }
      onChange([...attachments, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el archivo.");
      onChange([...attachments, ...added]); // keep whatever uploaded before the failure
    } finally {
      setBusy(false);
    }
  }

  async function remove(att: Attachment) {
    onChange(attachments.filter((a) => a.uploadId !== att.uploadId));
    if (expandedId === att.uploadId) setExpandedId(null);
    // Best-effort Storage cleanup; the row also expires after 7 days.
    try {
      await fetch(`/api/uploads/${att.uploadId}`, { method: "DELETE" });
    } catch {
      // Ignore — the TTL cron is the backstop.
    }
  }

  const expandedText = expandedId ? pastedTextByUploadId?.[expandedId] : undefined;

  return (
    <div className="file-upload">
      <div className="file-upload-row">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="visually-hidden"
          onChange={onSelect}
          disabled={disabled || busy}
        />
        <button
          type="button"
          className="attach-trigger"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          <IconPaperclip size={13} />
          {busy ? "Subiendo…" : "Adjuntar"}
        </button>
        {attachments.map((a) => {
          const pastedText = pastedTextByUploadId?.[a.uploadId];
          const isPasted = pastedText !== undefined;
          return (
            <span
              key={a.uploadId}
              className={`attachment-chip${isPasted ? " attachment-chip-pasted" : ""}`}
            >
              {a.filename}
              {isPasted && (
                <span className="attachment-chip-meta">{pastedText.length} car.</span>
              )}
              {isPasted && (
                <button
                  type="button"
                  className="attachment-chip-action"
                  onClick={() => setExpandedId((id) => (id === a.uploadId ? null : a.uploadId))}
                  aria-label={`Ver contenido de ${a.filename}`}
                  aria-expanded={expandedId === a.uploadId}
                  title="Ver contenido"
                >
                  <IconChevronDown
                    size={12}
                    className={expandedId === a.uploadId ? "attachment-chevron-open" : undefined}
                  />
                </button>
              )}
              {isPasted && onRevertPaste && (
                <button
                  type="button"
                  className="attachment-chip-action"
                  onClick={() => onRevertPaste(a)}
                  aria-label={`Convertir ${a.filename} a texto plano`}
                  title="Convertir a texto plano"
                >
                  <IconArrowBackUp size={12} />
                </button>
              )}
              <button
                type="button"
                className="attachment-remove"
                onClick={() => remove(a)}
                aria-label={`Quitar ${a.filename}`}
              >
                <IconX size={12} />
              </button>
            </span>
          );
        })}
      </div>
      {expandedText !== undefined && (
        <pre className="smart-paste-preview">{expandedText}</pre>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

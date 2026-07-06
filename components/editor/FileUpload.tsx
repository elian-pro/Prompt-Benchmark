"use client";

import { useRef, useState } from "react";
import { IconPaperclip, IconX } from "@tabler/icons-react";
import type { Attachment } from "@/lib/db/chat-sessions";
import { ATTACHMENT_ACCEPT, uploadAttachment } from "@/lib/attachments";

/**
 * Attaches files to the next message: uploads each to Storage and tracks the
 * returned references. Removing a chip deletes the file from Storage too.
 */
export function FileUpload({
  sessionId,
  attachments,
  onChange,
  disabled,
}: {
  sessionId: string;
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // Best-effort Storage cleanup; the row also expires after 7 days.
    try {
      await fetch(`/api/uploads/${att.uploadId}`, { method: "DELETE" });
    } catch {
      // Ignore — the TTL cron is the backstop.
    }
  }

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
        {attachments.map((a) => (
          <span key={a.uploadId} className="attachment-chip">
            {a.filename}
            <button
              type="button"
              className="attachment-remove"
              onClick={() => remove(a)}
              aria-label={`Quitar ${a.filename}`}
            >
              <IconX size={12} />
            </button>
          </span>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

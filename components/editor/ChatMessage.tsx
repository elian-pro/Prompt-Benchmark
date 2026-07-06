"use client";

import type { ReactNode } from "react";
import { IconPaperclip } from "@tabler/icons-react";
import type { MessageRole, Attachment } from "@/lib/db/chat-sessions";

/**
 * The model writes Markdown bold (**…**); render it as real bold instead of
 * leaving the asterisks visible. Everything else stays plain text (whitespace
 * kept by the bubble's pre-wrap). While streaming, an unpaired ** shows as-is
 * until its closing pair arrives — harmless and momentary.
 */
function renderBold(text: string): ReactNode[] {
  return text
    .split(/\*\*([^*]+)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/** A single chat bubble. Content is rendered as plain text (whitespace kept). */
export function ChatMessage({
  role,
  content,
  attachments,
  streaming = false,
}: {
  role: MessageRole;
  content: string;
  attachments?: Attachment[] | null;
  /** Show a blinking caret while the assistant response is still arriving. */
  streaming?: boolean;
}) {
  return (
    <div className={`chat-bubble chat-${role}`}>
      <span className="chat-role">{role === "user" ? "Tú" : "Opus"}</span>
      <div className="chat-content">
        {renderBold(content)}
        {streaming && <span className="chat-caret" aria-hidden />}
      </div>
      {attachments && attachments.length > 0 && (
        <div className="chat-attachments">
          {attachments.map((a) => (
            <span key={a.uploadId} className="attachment-chip">
              <IconPaperclip size={11} />
              {a.filename}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

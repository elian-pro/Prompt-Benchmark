"use client";

import { IconPaperclip } from "@tabler/icons-react";
import type { MessageRole, Attachment } from "@/lib/db/chat-sessions";

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
        {content}
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

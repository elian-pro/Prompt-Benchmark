"use client";

import { IconPaperclip } from "@tabler/icons-react";
import type { MessageRole, Attachment } from "@/lib/db/chat-sessions";

/** A single chat bubble. Content is rendered as plain text (whitespace kept). */
export function ChatMessage({
  role,
  content,
  attachments,
}: {
  role: MessageRole;
  content: string;
  attachments?: Attachment[] | null;
}) {
  return (
    <div className={`chat-bubble chat-${role}`}>
      <span className="chat-role">{role === "user" ? "Tú" : "Opus"}</span>
      <div className="chat-content">{content}</div>
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

"use client";

import type { MessageRole } from "@/lib/db/chat-sessions";

/** A single chat bubble. Content is rendered as plain text (whitespace kept). */
export function ChatMessage({
  role,
  content,
}: {
  role: MessageRole;
  content: string;
}) {
  return (
    <div className={`chat-bubble chat-${role}`}>
      <span className="chat-role">{role === "user" ? "Tú" : "Opus"}</span>
      <div className="chat-content">{content}</div>
    </div>
  );
}

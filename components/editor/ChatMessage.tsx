"use client";

import { useState, type ReactNode } from "react";
import { IconCheck, IconCopy, IconFileText, IconPaperclip } from "@tabler/icons-react";
import type { MessageRole, Attachment } from "@/lib/db/chat-sessions";
import { hasUnclosedFence } from "@/lib/prompts/editor-persona";
import { Button } from "@/components/ui/Button";

type Mode = "editor" | "creator";

const BLOCK_LABEL: Record<Mode, string> = {
  editor: "Prompt actualizado",
  creator: "Prompt construido",
};

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

/**
 * Splits a reply around its single fenced prompt block, mirroring the
 * server's extractPromptFromReply (same closed-fence rule): a message only
 * ever collapses into a card here when the draft actually did (or would)
 * update from it. No closed fence → `block` is null and the whole text is
 * `before`, so plain replies (a clarifying question) render exactly as before.
 */
function splitPromptBlock(text: string): { before: string; block: string | null; after: string } {
  const match = text.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!match || match.index === undefined) return { before: text, block: null, after: "" };
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const block = match[1].trim();
  return { before, block: block.length > 0 ? block : null, after };
}

/** The collapsed "here's the updated draft" card that replaces the raw fenced
 *  block — copies straight from the chat instead of requiring a scroll to the
 *  drawer and a manual select-all. */
function PromptBlockCard({ label, block }: { label: string; block: string }) {
  const [copied, setCopied] = useState(false);
  const lineCount = block.split("\n").length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the draft drawer's copy button still works.
    }
  }

  return (
    <div className="prompt-block-card">
      <IconFileText size={16} className="prompt-block-icon" />
      <div className="prompt-block-info">
        <span className="prompt-block-title">{label}</span>
        <span className="prompt-block-meta">
          {lineCount} {lineCount === 1 ? "línea" : "líneas"}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        onClick={copy}
      >
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

/** A single chat bubble. Assistant replies that carry a closed fenced prompt
 *  block collapse that block into a PromptBlockCard instead of dumping the
 *  raw markdown; everything else renders as plain text (whitespace kept). */
export function ChatMessage({
  role,
  content,
  attachments,
  streaming = false,
  mode = "editor",
}: {
  role: MessageRole;
  content: string;
  attachments?: Attachment[] | null;
  /** Show a blinking caret while the assistant response is still arriving. */
  streaming?: boolean;
  /** Editor vs Creator — only used to label a collapsed prompt-block card. */
  mode?: Mode;
}) {
  const { before, block, after } =
    role === "assistant" ? splitPromptBlock(content) : { before: content, block: null, after: "" };

  // Mid-stream with a fence opened but not yet closed: hide the raw partial
  // block (nobody should watch a full prompt "type" into the chat character
  // by character) and show a typing indicator instead — the same treatment
  // the Adversarial Lab uses for its "Escribiendo…" state. Once the fence
  // closes (live or already persisted), it renders as the card below instead.
  const midBlock = streaming && block === null && hasUnclosedFence(content);

  return (
    <div className={`chat-bubble chat-${role}`}>
      <span className="chat-role">{role === "user" ? "Tú" : "Opus"}</span>
      <div className="chat-content">
        {before.trim() && renderBold(before)}
        {midBlock && (
          <span className="chat-typing">
            Escribiendo el prompt actualizado…
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        )}
        {block && <PromptBlockCard label={BLOCK_LABEL[mode]} block={block} />}
        {after.trim() && renderBold(after)}
        {streaming && !midBlock && <span className="chat-caret" aria-hidden />}
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

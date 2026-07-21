"use client";

import { useState, type ReactNode } from "react";
import { IconCheck, IconCopy, IconFileText, IconPaperclip } from "@tabler/icons-react";
import type { MessageRole, Attachment } from "@/lib/db/chat-sessions";
import {
  hasUnclosedPromptBlock,
  splitPromptBlock,
  unclosedBlockPreamble,
} from "@/lib/prompts/editor-persona";
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

/** The collapsed "here's the updated draft" card that replaces the raw prompt
 *  block: copies straight from the chat instead of scrolling to the drawer.
 *  While `writing` (the block is still streaming) it shows an "escribiendo..."
 *  meta in place of the line count and hides the copy button. */
function PromptBlockCard({
  label,
  block,
  writing = false,
}: {
  label: string;
  block?: string;
  writing?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const lineCount = block ? block.split("\n").length : 0;

  async function copy() {
    if (!block) return;
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the draft drawer's copy button still works.
    }
  }

  return (
    <div className={`prompt-block-card${writing ? " is-writing" : ""}`}>
      <IconFileText size={16} className="prompt-block-icon" />
      <div className="prompt-block-info">
        <span className="prompt-block-title">{label}</span>
        {writing ? (
          <span className="prompt-block-meta chat-typing">
            escribiendo
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        ) : (
          <span className="prompt-block-meta">
            {lineCount} {lineCount === 1 ? "línea" : "líneas"}
          </span>
        )}
      </div>
      {!writing && block && (
        <Button
          variant="ghost"
          size="sm"
          icon={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          onClick={copy}
        >
          {copied ? "Copiado" : "Copiar"}
        </Button>
      )}
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

  // Mid-stream with the block opened but not yet closed: nobody should watch a
  // full prompt "type" into the chat character by character. Show the card
  // right away in its "escribiendo..." state instead of the raw partial block;
  // once the block closes (live or persisted) the same card shows the line
  // count. `before` from splitPromptBlock is the WHOLE reply while unclosed
  // (it can't locate the block without its closing marker), so it would leak
  // the partial prompt as raw chat text right next to the writing card.
  // Swap it for just the prose before the opening marker instead.
  const midBlock = streaming && block === null && hasUnclosedPromptBlock(content);
  const shownBefore = midBlock ? unclosedBlockPreamble(content) : before;

  return (
    <div className={`chat-bubble chat-${role}`}>
      <span className="chat-role">{role === "user" ? "Tú" : "Opus"}</span>
      <div className="chat-content">
        {shownBefore.trim() && renderBold(shownBefore)}
        {midBlock && <PromptBlockCard label={BLOCK_LABEL[mode]} writing />}
        {block && <PromptBlockCard label={BLOCK_LABEL[mode]} block={block} />}
        {after.trim() && renderBold(after)}
        {streaming && !midBlock && !block && <span className="chat-caret" aria-hidden />}
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

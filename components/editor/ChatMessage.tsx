"use client";

import { useState, type ReactNode } from "react";
import { IconCheck, IconCopy, IconFileText, IconPaperclip, IconListSearch } from "@tabler/icons-react";
import type { MessageRole, Attachment, MessageAnswer } from "@/lib/db/chat-sessions";
import {
  hasUnclosedPromptBlock,
  splitPromptBlock,
  unclosedBlockPreamble,
} from "@/lib/prompts/editor-persona";
import {
  hasUnclosedOptionsBlock,
  optionsBlockPreamble,
  splitOptionsBlock,
} from "@/lib/prompts/options-block";
import { OptionsBlock } from "@/components/sessions/OptionsBlock";
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
 *  raw markdown. An assistant reply carrying a selectable-options block renders
 *  the interactive OptionsBlock instead. Everything else is plain text.
 *
 *  Precedence: the prompt block wins. It is the draft-affecting, higher-stakes
 *  path, and the two contracts are mutually exclusive by design, so only when a
 *  reply has no prompt block (complete or still streaming) do we look for an
 *  options block. A malformed reply that somehow has both shows the prompt card
 *  and lets any stray options markers fall through as text. */
export function ChatMessage({
  role,
  content,
  attachments,
  streaming = false,
  mode = "editor",
  messageId,
  answeredSelection = null,
  interactive = false,
  onSubmitOptions,
}: {
  role: MessageRole;
  content: string;
  attachments?: Attachment[] | null;
  /** Show a blinking caret while the assistant response is still arriving. */
  streaming?: boolean;
  /** Editor vs Creator — only used to label a collapsed prompt-block card. */
  mode?: Mode;
  /** Persisted message id — required for an interactive/answered options block. */
  messageId?: string;
  /** The persisted selection that answered this block, if any (read-only view). */
  answeredSelection?: MessageAnswer | null;
  /** Whether this is the live turn whose options block accepts input. */
  interactive?: boolean;
  /** Sends the options answer as a user message plus its structured selection. */
  onSubmitOptions?: (answerText: string, answer: MessageAnswer) => void;
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
  const hasPrompt = block !== null || midBlock;

  // Options block only when there is no prompt block in play (see precedence).
  const options =
    role === "assistant" && !hasPrompt
      ? splitOptionsBlock(content)
      : { before: content, block: null, after: "" };
  // While streaming, show the "preparando opciones" placeholder for both the
  // unclosed case and the just-closed-but-not-yet-persisted case (the preview
  // has no messageId, so the interactive block can't render until re-sync).
  const optionsStreaming =
    role === "assistant" &&
    !hasPrompt &&
    streaming &&
    (hasUnclosedOptionsBlock(content) || options.block !== null);
  const showOptionsBlock = Boolean(options.block) && !optionsStreaming && Boolean(messageId);

  // Choose the prose shown before/after whichever block (prompt or options) is active.
  const shownBefore = midBlock
    ? unclosedBlockPreamble(content)
    : optionsStreaming
      ? optionsBlockPreamble(content)
      : hasPrompt
        ? before
        : options.block
          ? options.before
          : before;
  const shownAfter = hasPrompt
    ? after
    : options.block && !optionsStreaming
      ? options.after
      : "";

  return (
    <div className={`chat-bubble chat-${role}`}>
      <span className="chat-role">{role === "user" ? "Tú" : "Opus"}</span>
      <div className="chat-content">
        {shownBefore.trim() && renderBold(shownBefore)}
        {midBlock && <PromptBlockCard label={BLOCK_LABEL[mode]} writing />}
        {block && <PromptBlockCard label={BLOCK_LABEL[mode]} block={block} />}
        {optionsStreaming && <OptionsWritingCard />}
        {showOptionsBlock && options.block && messageId && (
          <OptionsBlock
            block={options.block}
            messageId={messageId}
            answered={answeredSelection}
            interactive={interactive}
            onSubmit={onSubmitOptions ?? (() => {})}
          />
        )}
        {shownAfter.trim() && renderBold(shownAfter)}
        {streaming && !midBlock && !block && !optionsStreaming && !showOptionsBlock && (
          <span className="chat-caret" aria-hidden />
        )}
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

/** The placeholder shown while an options block is still streaming, so the raw
 *  JSON never types out into the chat (mirrors PromptBlockCard's writing state). */
function OptionsWritingCard() {
  return (
    <div className="prompt-block-card is-writing">
      <IconListSearch size={16} className="prompt-block-icon" />
      <div className="prompt-block-info">
        <span className="prompt-block-title">Opciones</span>
        <span className="prompt-block-meta chat-typing">
          preparando opciones
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      </div>
    </div>
  );
}

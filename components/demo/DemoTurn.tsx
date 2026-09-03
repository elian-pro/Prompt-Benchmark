"use client";

import { IconCheck, IconPencil } from "@tabler/icons-react";

import type { DemoMessageRole } from "@/lib/db/demo-sessions";
import type { ChatTrace, ToolStep } from "@/lib/client-tools";
import { parseDebug, parseTurnBubbles } from "@/lib/adversarial-message";
import { parseRichText } from "@/lib/rich-text";

/**
 * One turn of a demo conversation, rendered identically wherever it shows up:
 * the Playground, the client's public demo link, and the admin's read only view
 * of what a client did.
 *
 * That sameness is the point. The client is testing the agent, so what they see
 * has to be what the user sees when reviewing it afterwards, down to how a
 * broken envelope is displayed.
 *
 * Everything interactive is optional. Pass no `onToggleSelect` and the turn is
 * plain text with no affordances, which is what the admin transcript wants.
 */

/**
 * A bubble's text with its inline formatting applied. Both syntaxes are
 * honored: WhatsApp's, which is what a real lead sees, and markdown's, which is
 * what a model writes whether we like it or not.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((t, i) => {
        if (t.bold) return <strong key={i}>{t.text}</strong>;
        if (t.italic) return <em key={i}>{t.text}</em>;
        if (t.strike) return <s key={i}>{t.text}</s>;
        if (t.mono) return <code key={i}>{t.text}</code>;
        return <span key={i}>{t.text}</span>;
      })}
    </>
  );
}

/** Any special state with no readable message names itself explicitly,
 *  e.g. "El bot pasó a estado «humano» y dejó de responder.", which is
 *  exactly what a live test needs to verify (Sprint 6, decision 2). */
export function emptyBotMessage(state: string | null): string {
  return state ? `El bot pasó a estado «${state}» y dejó de responder.` : "El bot no envió mensaje.";
}

export type TurnLabels = {
  bot: string;
  human: string;
};

/** What the user sees while testing: the bot is the client's, they are the lead. */
export const STUDIO_LABELS: TurnLabels = { bot: "Bot del cliente", human: "Tú (lead)" };

/** What the client sees on their own link. No jargon, no "bot del cliente":
 *  from their side it is simply their agent, and they are themselves. */
export const CLIENT_LABELS: TurnLabels = { bot: "Agente", human: "Tú" };

export function DemoTurn({
  id,
  role,
  content,
  labels = STUDIO_LABELS,
  selected = false,
  pins = [],
  flashed = false,
  onToggleSelect,
  onJumpToNote,
  registerRef,
  onEditOpening,
  toolCalls,
  showDebug = false,
  trace,
}: {
  id: string;
  role: DemoMessageRole;
  content: string;
  /** What the client's tools did on this turn. Playground only: the client's
   *  own link never receives them. */
  toolCalls?: ToolStep[] | null;
  labels?: TurnLabels;
  selected?: boolean;
  /** Numbered markers for the notes that reference this turn. */
  pins?: number[];
  flashed?: boolean;
  /** Omit to render a turn that cannot be tagged. */
  onToggleSelect?: (id: string) => void;
  onJumpToNote?: (noteIndex: number) => void;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
  /** When set, this turn is the editable opening message: shows a pencil that
   *  opens the edit modal (Sprint 15). */
  onEditOpening?: () => void;
  /** Show the debug metadata (razonamiento, regla_aplicada) a debug-mode turn
   *  carries. Playground only: the client's own link never passes this. */
  showDebug?: boolean;
  /** Raw ChatRequest/ChatResponse per provider round trip this turn made.
   *  Playground only: the client's own link never receives this. */
  trace?: ChatTrace[];
}) {
  const side = role === "bot" ? "turn-bot" : "turn-lead";
  const roleLabel = role === "bot" ? labels.bot : labels.human;
  const { messages, state, malformed } = parseTurnBubbles(content);
  // Malformed = the reply looked like JSON but couldn't be parsed (e.g. broken
  // envelope). Never dump raw braces as bubbles: show one clean error bubble
  // so a bad prompt output is obvious without garbage on screen.
  const bubbles = malformed
    ? ["No se pudo leer la respuesta del bot (formato inesperado)."]
    : messages.length > 0
      ? messages
      : [emptyBotMessage(state)];
  const isEmpty = malformed || messages.length === 0;
  const selectable = Boolean(onToggleSelect);
  const debug = showDebug && role === "bot" ? parseDebug(content) : null;

  return (
    <div
      ref={(el) => registerRef?.(id, el)}
      className={`chat-turn ${side}${selected ? " is-selected" : ""}${flashed ? " is-flashed" : ""}${
        selectable ? "" : " is-static"
      }`}
      onClick={selectable ? () => onToggleSelect?.(id) : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleSelect?.(id);
              }
            }
          : undefined
      }
    >
      {pins.length > 0 && (
        <div className="chat-pins">
          {pins.map((p) => (
            <button
              key={p}
              type="button"
              className="chat-pin"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToNote?.(p - 1);
              }}
              aria-label={`Ir a la nota ${p}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <span className="chat-turn-role">
        {roleLabel}
        {/* Selected for a report. It rides on the line that already names the
            message, so nothing has to move to make room for it: on the
            agent's side it follows the label, on yours it leads it, always on
            the side the bubble is on. */}
        {selected && selectable && (
          <span className="chat-check" aria-hidden="true">
            <IconCheck size={9} stroke={3} />
          </span>
        )}
        {onEditOpening && (
          <button
            type="button"
            className="icon-btn chat-turn-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEditOpening();
            }}
            aria-label="Editar mensaje de inicio"
            title="Editar mensaje de inicio"
          >
            <IconPencil size={13} />
          </button>
        )}
      </span>
      {bubbles.map((b, i) => {
        const isLast = i === bubbles.length - 1;
        return (
          <div key={i} className={`chat-msg${malformed ? " chat-msg-error" : ""}`}>
            <div className={`chat-content${isEmpty ? " chat-empty" : ""}`}>
              <RichText text={b} />
            </div>
            {/* The estado hangs off the last bubble, WhatsApp-style. */}
            {state && isLast && !isEmpty && (
              <div className="chat-state">
                <span className="chat-state-label">Estado</span>
                <span className="chat-state-value">{state}</span>
              </div>
            )}
          </div>
        );
      })}
      {/* A tool that answered with an empty list and a tool the model never
          called produce the same bubble. This is how you tell them apart. */}
      {toolCalls && toolCalls.length > 0 && (
        <details className="chat-tools" onClick={(e) => e.stopPropagation()}>
          <summary>
            {toolCalls.length === 1
              ? `1 herramienta: ${toolCalls[0].name}`
              : `${toolCalls.length} herramientas`}
          </summary>
          {toolCalls.map((step, i) => (
            <div key={i} className={`chat-tool-step${step.ok ? "" : " is-error"}`}>
              <span className="chat-tool-name">
                {step.name}
                <span className="chat-tool-meta">
                  {step.status ? `${step.status} · ` : ""}
                  {step.ms} ms
                </span>
              </span>
              <code>{step.args}</code>
              <code>{step.preview}</code>
            </div>
          ))}
        </details>
      )}
      {debug && (
        <details className="chat-tools" onClick={(e) => e.stopPropagation()}>
          <summary>Razonamiento: {debug.reglaAplicada}</summary>
          <div className="chat-tool-step">
            <span className="chat-tool-name">razonamiento</span>
            <code>{debug.razonamiento}</code>
            <span className="chat-tool-name">regla aplicada</span>
            <code>{debug.reglaAplicada}</code>
          </div>
        </details>
      )}
      {trace && trace.length > 0 && (
        <details className="chat-tools" onClick={(e) => e.stopPropagation()}>
          <summary>
            {trace.length === 1 ? "JSON crudo" : `JSON crudo (${trace.length} llamadas)`}
          </summary>
          {trace.map((t, i) => (
            <div key={i} className="chat-tool-step">
              {trace.length > 1 && (
                <span className="chat-tool-name">
                  Llamada {i + 1}/{trace.length}
                </span>
              )}
              <span className="chat-tool-name">request</span>
              <pre>{JSON.stringify(t.request, null, 2)}</pre>
              <span className="chat-tool-name">response</span>
              <pre>{JSON.stringify(t.response, null, 2)}</pre>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** The optimistic bubble shown right after sending, before the reload: never
 *  persisted yet, so it has no id and can't be tagged. */
export function PendingTurn({
  content,
  labels = STUDIO_LABELS,
}: {
  content: string;
  labels?: TurnLabels;
}) {
  return (
    <div className="chat-turn turn-lead">
      <span className="chat-turn-role">{labels.human}</span>
      <div className="chat-msg">
        <div className="chat-content">{content}</div>
      </div>
    </div>
  );
}

export function TypingIndicator({ labels = STUDIO_LABELS }: { labels?: TurnLabels }) {
  return (
    <div className="chat-turn turn-bot">
      <span className="chat-turn-role">{labels.bot}</span>
      <div className="chat-msg">
        <div className="chat-content chat-typing">
          Escribiendo
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}

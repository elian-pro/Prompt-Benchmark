"use client";

import type { KeyboardEvent } from "react";

import type { ConversationTurn } from "@/lib/conversation-turns";

/**
 * One turn of a real conversation, rendered with the Playground's chat classes
 * so a real conversation and a simulated one read the same way.
 *
 * Shared by every screen that shows a stored conversation: the Library's read
 * only transcript, Replay's tagging workspace, and a filed case. It was written
 * twice before this file existed, and the third copy is what made it a
 * component: the pins, the estado line and the "sistema" turn have to look the
 * same everywhere or the same conversation reads as two different things.
 *
 * Tagging is opt in: pass `onToggle` and the turn becomes clickable. Without
 * it the turn is static, which is what a filed case and the Library want.
 */
export const ROLE_LABEL: Record<ConversationTurn["rol"], string> = {
  lead: "Lead",
  bot: "Bot del cliente",
  sistema: "Sistema",
};

export function Turn({
  turn,
  pins = [],
  selected = false,
  onToggle,
}: {
  turn: ConversationTurn;
  /** Numbered marks of the notes pointing at this turn. */
  pins?: number[];
  selected?: boolean;
  onToggle?: () => void;
}) {
  if (turn.rol === "sistema") {
    return (
      <div className="chat-turn turn-bot is-static">
        <span className="chat-turn-role">{ROLE_LABEL.sistema}</span>
        <div className="chat-msg">
          <div className="chat-content chat-empty">El bot pasó a estado «{turn.estado}».</div>
        </div>
      </div>
    );
  }

  const side = turn.rol === "lead" ? "turn-lead" : "turn-bot";
  return (
    <div
      className={`chat-turn ${side}${selected ? " is-selected" : ""}${
        onToggle ? "" : " is-static"
      }`}
      {...(onToggle
        ? {
            onClick: onToggle,
            role: "button" as const,
            tabIndex: 0,
            "aria-pressed": selected,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            },
          }
        : {})}
    >
      {pins.length > 0 && (
        <div className="chat-pins">
          {pins.map((p) => (
            <span key={p} className="chat-pin">
              {p}
            </span>
          ))}
        </div>
      )}
      <span className="chat-turn-role">{ROLE_LABEL[turn.rol]}</span>
      <div className="chat-msg">
        <div className="chat-content">{turn.texto}</div>
        {turn.estado && (
          <div className="chat-state">
            <span className="chat-state-label">Estado</span>
            <span className="chat-state-value">{turn.estado}</span>
          </div>
        )}
      </div>
    </div>
  );
}

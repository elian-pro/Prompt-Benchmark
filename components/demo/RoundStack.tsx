"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";

/** One conversation of a visitor: everything they wrote before starting over.
 *  `round` is the number the messages carry; `index` is its place in time. */
export type RoundSummary = {
  round: number;
  messageCount: number;
  /** First and last message of the round, ISO. Null when it has none. */
  startedAt: string | null;
  endedAt: string | null;
  /** The first thing the lead said, to recognize it at a glance. */
  firstLead: string | null;
};

function time(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function day(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    : "Sin fecha";
}

/**
 * The stack, drawn as squares: one for a single conversation, a second peeking
 * behind it for two, a third for three or more. Past three it stops growing,
 * because the third square already means "there is a pile", not "there are
 * exactly three".
 *
 * The same idea as a Mac folder that shows a sliver of paper when it holds
 * something: the object says how much is inside before it is opened.
 */
function StackIcon({ count }: { count: number }) {
  const layers = Math.min(count, 3);
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {layers >= 3 && (
        <rect x="9" y="3" width="12" height="12" rx="3" className="stack-layer stack-layer-back" />
      )}
      {layers >= 2 && (
        <rect x="6.5" y="5.5" width="12" height="12" rx="3" className="stack-layer stack-layer-mid" />
      )}
      <rect x="4" y="8" width="12" height="12" rx="3" className="stack-layer stack-layer-front" />
    </svg>
  );
}

/**
 * Every conversation this visitor had through the link, behind one button.
 *
 * They used to run together in the transcript with a divider between them,
 * which read as one conversation that changed its mind. Only the selected one
 * is on screen now, and the rest are one click away, in order, with enough on
 * each row to tell them apart.
 */
export function RoundStack({
  rounds,
  selected,
  onSelect,
}: {
  /** Chronological, oldest first. */
  rounds: RoundSummary[];
  selected: number;
  onSelect: (round: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = rounds.findIndex((r) => r.round === selected) + 1;

  return (
    <>
      <button
        type="button"
        className="round-stack-btn"
        onClick={() => setOpen(true)}
        aria-label={
          rounds.length === 1
            ? "Una conversación"
            : `${rounds.length} conversaciones de esta persona`
        }
        title="Conversaciones de esta persona"
      >
        <StackIcon count={rounds.length} />
        <span>
          {rounds.length === 1
            ? "1 conversación"
            : `Conversación ${current} de ${rounds.length}`}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          rounds.length === 1
            ? "Su conversación"
            : `Sus conversaciones (${rounds.length})`
        }
      >
        <div className="round-list">
          {rounds.map((r, i) => (
            <button
              key={r.round}
              type="button"
              className={`round-row${r.round === selected ? " is-selected" : ""}`}
              onClick={() => {
                onSelect(r.round);
                setOpen(false);
              }}
            >
              <span className="round-row-top">
                <span className="round-row-title">Conversación {i + 1}</span>
                {r.round === selected && <span className="round-row-tag">En pantalla</span>}
              </span>
              <span className="round-row-meta">
                {day(r.startedAt)} · {time(r.startedAt)} a {time(r.endedAt)} ·{" "}
                {r.messageCount} mensaje{r.messageCount === 1 ? "" : "s"}
              </span>
              <span className="round-row-preview">
                {r.firstLead ? `“${r.firstLead}”` : "No escribió nada."}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

"use client";

import { useId, useMemo, useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconListNumbers,
} from "@tabler/icons-react";
import type { OptionsBlock as OptionsBlockData, QuestionSelection } from "@/lib/prompts/options-block";
import { buildAnswerSummary, moveRankItem } from "@/lib/prompts/options-block";
import type { MessageAnswer } from "@/lib/db/chat-sessions";

/** Local selection state, keyed by question id. single_select holds a string,
 *  multi_select and rank hold string arrays (multi = chosen set, rank = order). */
type Selections = Record<string, string | string[]>;

function initialSelections(
  block: OptionsBlockData,
  answered: MessageAnswer | null,
): Selections {
  const seeded: Selections = {};
  const byId = new Map(answered?.selections.map((s) => [s.questionId, s.value]) ?? []);
  for (const q of block.questions) {
    const prior = byId.get(q.id);
    if (prior !== undefined) {
      seeded[q.id] = prior;
    } else if (q.type === "rank") {
      seeded[q.id] = [...q.options];
    } else if (q.type === "multi_select") {
      seeded[q.id] = [];
    } else {
      seeded[q.id] = "";
    }
  }
  return seeded;
}

function isQuestionAnswered(type: string, value: string | string[]): boolean {
  if (type === "single_select") return typeof value === "string" && value.length > 0;
  if (type === "multi_select") return Array.isArray(value) && value.length > 0;
  return true; // rank is always a valid ordering
}

/**
 * Renders a selectable-options block as tappable buttons. The block definition
 * lives in the assistant message; when the user confirms, `onSubmit` sends the
 * human-readable summary as a normal user message plus the structured selection
 * for persistence. An already-answered or non-interactive block renders
 * read-only and starts collapsed to its one-line summary (reopenable).
 */
export function OptionsBlock({
  block,
  messageId,
  answered,
  interactive,
  onSubmit,
}: {
  block: OptionsBlockData;
  messageId: string;
  answered: MessageAnswer | null;
  interactive: boolean;
  onSubmit: (answerText: string, answer: MessageAnswer) => void;
}) {
  const bodyId = useId();
  const [selections, setSelections] = useState<Selections>(() =>
    initialSelections(block, answered),
  );
  const [submitted, setSubmitted] = useState(false);
  // Locked = read-only: already answered, just submitted, or a stale block that
  // isn't the live turn. Only a live, unanswered block accepts input.
  const locked = answered !== null || submitted || !interactive;
  const isAnswered = answered !== null || submitted;
  const [open, setOpen] = useState(!isAnswered);

  const toSelectionList = (sel: Selections): QuestionSelection[] =>
    block.questions.map((q) => ({ questionId: q.id, type: q.type, value: sel[q.id] }));

  const summaryText = useMemo(() => {
    if (!isAnswered) return null;
    return buildAnswerSummary(block, toSelectionList(selections));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswered, selections, block]);

  const allAnswered = block.questions.every((q) => isQuestionAnswered(q.type, selections[q.id]));
  // A single single_select question submits on tap; anything else confirms.
  const autoSubmit =
    block.questions.length === 1 && block.questions[0].type === "single_select";

  function submit(next: Selections) {
    if (locked) return;
    const list = toSelectionList(next);
    const answerText = buildAnswerSummary(block, list);
    setSubmitted(true);
    setOpen(false);
    onSubmit(answerText, { sourceMessageId: messageId, selections: list });
  }

  function pickSingle(qId: string, option: string) {
    if (locked) return;
    const next = { ...selections, [qId]: option };
    setSelections(next);
    if (autoSubmit) submit(next);
  }

  function toggleMulti(qId: string, option: string) {
    if (locked) return;
    const current = Array.isArray(selections[qId]) ? (selections[qId] as string[]) : [];
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setSelections({ ...selections, [qId]: next });
  }

  function reorder(qId: string, index: number, dir: -1 | 1) {
    if (locked) return;
    const current = Array.isArray(selections[qId]) ? (selections[qId] as string[]) : [];
    setSelections({ ...selections, [qId]: moveRankItem(current, index, dir) });
  }

  const headerLabel = summaryText ?? (block.questions.length === 1
    ? block.questions[0].prompt
    : `${block.questions.length} preguntas`);

  return (
    <section className={`options-block${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="options-header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <IconChevronDown size={15} className="options-chevron" />
        <span className="options-header-label">{headerLabel}</span>
        {isAnswered && <span className="options-answered-tag">Respondido</span>}
      </button>

      <div id={bodyId} className="options-body">
        <div className="options-body-inner">
          <div className="options-body-content">
            {block.questions.map((q) => {
              const value = selections[q.id];
              return (
                <div key={q.id} className="options-question">
                  <p className="options-prompt">{q.prompt}</p>

                  {q.type === "rank" ? (
                    <ol className="options-rank">
                      {(Array.isArray(value) ? value : q.options).map((opt, i, arr) => (
                        <li key={opt} className="options-rank-row">
                          <span className="options-rank-index">{i + 1}</span>
                          <span className="options-rank-label">{opt}</span>
                          <span className="options-rank-arrows">
                            <button
                              type="button"
                              className="options-arrow"
                              aria-label={`Subir ${opt}`}
                              disabled={locked || i === 0}
                              onClick={() => reorder(q.id, i, -1)}
                            >
                              <IconChevronUp size={15} />
                            </button>
                            <button
                              type="button"
                              className="options-arrow"
                              aria-label={`Bajar ${opt}`}
                              disabled={locked || i === arr.length - 1}
                              onClick={() => reorder(q.id, i, 1)}
                            >
                              <IconChevronDown size={15} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="options-choices">
                      {q.options.map((opt) => {
                        const selected =
                          q.type === "single_select"
                            ? value === opt
                            : Array.isArray(value) && value.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`option-btn${selected ? " is-selected" : ""}`}
                            aria-pressed={selected}
                            disabled={locked}
                            onClick={() =>
                              q.type === "single_select"
                                ? pickSingle(q.id, opt)
                                : toggleMulti(q.id, opt)
                            }
                          >
                            {selected && <IconCheck size={14} className="option-check" />}
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {!locked && !autoSubmit && (
              <div className="options-actions">
                <button
                  type="button"
                  className="options-confirm"
                  disabled={!allAnswered}
                  onClick={() => submit(selections)}
                >
                  <IconListNumbers size={14} />
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconLetterCase,
  IconReplace,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

type Match = { start: number; end: number };

/** A character is part of a word (for whole-word matching). Covers accented
 *  Spanish letters and digits, not just ASCII. */
function isWordChar(ch: string | undefined): boolean {
  return ch != null && /[\p{L}\p{N}_]/u.test(ch);
}

/** All non-overlapping matches of `term` in `text`, honoring case sensitivity
 *  and whole-word. Manual scan (not regex) so the search term never needs
 *  escaping and behaves literally. */
function findMatches(
  text: string,
  term: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Match[] {
  if (!term) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? term : term.toLowerCase();
  const out: Match[] = [];
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    const end = idx + needle.length;
    const boundedLeft = !wholeWord || !isWordChar(text[idx - 1]);
    const boundedRight = !wholeWord || !isWordChar(text[end]);
    if (boundedLeft && boundedRight) out.push({ start: idx, end });
    from = idx + needle.length;
  }
  return out;
}

/**
 * Find / replace bar for a plain <textarea>, reusable across the manual
 * editing surfaces (Library draft today; the Editor's manual mode later).
 *
 * "Highlight and navigate" UX: type a term, step through matches with the
 * up/down controls (or Enter / Shift+Enter), and for each one either
 * "Reemplazar" (replace this occurrence and advance) or just keep navigating
 * to skip it, matching the "one by one, skip the ones that don't apply"
 * flow. "Reemplazar todo" does the bulk case in one go. The active match is
 * selected natively in the textarea so it highlights and scrolls into view.
 *
 * The component never holds the text itself: it reads `value` and calls
 * `onChange` with the new string, so the parent stays the single source of
 * truth (and its autosave/dirty tracking keeps working unchanged).
 */
export function FindReplace({
  textareaRef,
  value,
  onChange,
  onClose,
  onReplaceAll,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  /** Optional notice after a bulk replace (e.g. to show a toast). */
  onReplaceAll?: (count: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [active, setActive] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  // After a single replace, land on the next match at/after this offset
  // instead of re-selecting the text we just inserted.
  const pendingOffset = useRef<number | null>(null);

  const matches = useMemo(
    () => findMatches(value, search, caseSensitive, wholeWord),
    [value, search, caseSensitive, wholeWord],
  );

  // Focus the search field when the bar opens.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Keep `active` in range as matches change (typing in either the textarea or
  // the search box). A single-replace lands on the remembered offset.
  useEffect(() => {
    if (pendingOffset.current != null) {
      const offset = pendingOffset.current;
      pendingOffset.current = null;
      const next = matches.findIndex((m) => m.start >= offset);
      setActive(matches.length === 0 ? -1 : next === -1 ? matches.length - 1 : next);
      return;
    }
    setActive((cur) => (cur >= matches.length ? matches.length - 1 : cur));
  }, [matches]);

  // Select the active match in the textarea so it highlights and scrolls in.
  const selectMatch = useCallback(
    (index: number) => {
      const m = matches[index];
      const ta = textareaRef.current;
      if (!m || !ta) return;
      ta.focus();
      ta.setSelectionRange(m.start, m.end);
    },
    [matches, textareaRef],
  );

  function go(delta: number) {
    if (matches.length === 0) return;
    const base = active === -1 ? (delta > 0 ? -1 : 0) : active;
    const next = (base + delta + matches.length) % matches.length;
    setActive(next);
    selectMatch(next);
  }

  function replaceCurrent() {
    if (matches.length === 0) return;
    const index = active === -1 ? 0 : active;
    const m = matches[index];
    if (!m) return;
    pendingOffset.current = m.start + replace.length;
    onChange(value.slice(0, m.start) + replace + value.slice(m.end));
  }

  function replaceAll() {
    if (matches.length === 0) return;
    // Rebuild left to right so earlier replacements don't shift later offsets.
    let out = "";
    let cursor = 0;
    for (const m of matches) {
      out += value.slice(cursor, m.start) + replace;
      cursor = m.end;
    }
    out += value.slice(cursor);
    const count = matches.length;
    setActive(-1);
    onChange(out);
    onReplaceAll?.(count);
  }

  const counter =
    search.length === 0
      ? ""
      : matches.length === 0
        ? "Sin coincidencias"
        : `${active === -1 ? 0 : active + 1} / ${matches.length}`;

  return (
    <div className="find-replace">
      <div className="find-replace-row">
        <div className="find-replace-field">
          <IconSearch size={13} className="find-replace-field-icon" />
          <input
            ref={searchRef}
            className="find-replace-input"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go(e.shiftKey ? -1 : 1);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button
            type="button"
            className={`find-replace-toggle${caseSensitive ? " is-on" : ""}`}
            title="Distinguir mayúsculas y minúsculas"
            aria-pressed={caseSensitive}
            onClick={() => setCaseSensitive((v) => !v)}
          >
            <IconLetterCase size={14} />
          </button>
          <button
            type="button"
            className={`find-replace-toggle${wholeWord ? " is-on" : ""}`}
            title="Palabra completa"
            aria-pressed={wholeWord}
            onClick={() => setWholeWord((v) => !v)}
          >
            <span className="find-replace-word">ab</span>
          </button>
        </div>
        <span className="find-replace-counter">{counter}</span>
        <div className="find-replace-nav">
          <button
            type="button"
            className="find-replace-btn"
            title="Anterior (Shift+Enter)"
            aria-label="Coincidencia anterior"
            onClick={() => go(-1)}
            disabled={matches.length === 0}
          >
            <IconChevronUp size={15} />
          </button>
          <button
            type="button"
            className="find-replace-btn"
            title="Siguiente (Enter)"
            aria-label="Siguiente coincidencia"
            onClick={() => go(1)}
            disabled={matches.length === 0}
          >
            <IconChevronDown size={15} />
          </button>
          <button
            type="button"
            className="find-replace-btn"
            title="Cerrar (Esc)"
            aria-label="Cerrar buscar y reemplazar"
            onClick={onClose}
          >
            <IconX size={15} />
          </button>
        </div>
      </div>

      <div className="find-replace-row">
        <div className="find-replace-field">
          <IconReplace size={13} className="find-replace-field-icon" />
          <input
            className="find-replace-input"
            placeholder="Reemplazar con…"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                replaceCurrent();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <div className="find-replace-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={replaceCurrent}
            disabled={matches.length === 0}
          >
            Reemplazar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={replaceAll}
            disabled={matches.length === 0}
          >
            Reemplazar todo
          </button>
        </div>
      </div>
    </div>
  );
}

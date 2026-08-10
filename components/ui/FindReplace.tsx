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
  const bandRef = useRef<HTMLDivElement>(null);
  // Vertical offset of the marked line inside the textarea's scrolled content,
  // null when there is no match to mark.
  const bandTop = useRef<number | null>(null);
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

  // Put the band over the line at `bandTop` (an offset inside the textarea's
  // scrolled content), or hide it when there is nothing to mark. Written
  // straight to the DOM: this also runs on every scroll frame.
  const placeBand = useCallback(() => {
    const band = bandRef.current;
    const ta = textareaRef.current;
    if (!band || !ta) return;
    if (bandTop.current == null) {
      band.style.display = "none";
      return;
    }
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || 0;
    const border = parseFloat(style.borderTopWidth) || 0;
    const rect = ta.getBoundingClientRect();
    const y = bandTop.current - ta.scrollTop;
    // Scrolled out of the textarea's own viewport: nothing to mark.
    if (y + lineHeight <= 0 || y >= ta.clientHeight) {
      band.style.display = "none";
      return;
    }
    band.style.display = "block";
    band.style.top = `${rect.top + border + y}px`;
    band.style.left = `${rect.left + border}px`;
    band.style.width = `${rect.width - border * 2}px`;
    band.style.height = `${lineHeight}px`;
  }, [textareaRef]);

  // The band is positioned against the viewport, so it has to follow both the
  // textarea's own scrollbar and the page's.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const follow = () => placeBand();
    ta.addEventListener("scroll", follow);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      ta.removeEventListener("scroll", follow);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [placeBand, textareaRef]);

  // Any edit to the text or the search term moves every offset: drop the band
  // until the next navigation puts it back.
  useEffect(() => {
    bandTop.current = null;
    placeBand();
  }, [matches, placeBand]);

  // Select the active match, scroll it to the middle of the textarea and mark
  // its line. The textarea is never focused: the search field keeps the focus
  // so Enter keeps stepping through matches instead of typing a newline into
  // the prompt. Chrome does not paint the selection of an unfocused textarea,
  // which is what the band is for.
  const selectMatch = useCallback(
    (index: number) => {
      const m = matches[index];
      const ta = textareaRef.current;
      if (!m || !ta) return;
      const style = getComputedStyle(ta);
      const lineHeight = parseFloat(style.lineHeight) || 0;
      // Where the match sits inside the scroll box: put the text up to it in
      // the textarea itself and read how tall that is. Measuring on the real
      // element (rather than a mirror div) gets the wrapping, font and padding
      // for free. Synchronous, so nothing renders in between. Measure before
      // selecting: assigning `value` drops the selection.
      const previous = ta.value;
      ta.value = value.slice(0, m.start);
      const top =
        ta.scrollHeight - parseFloat(style.paddingBottom) - lineHeight;
      ta.value = previous;
      ta.setSelectionRange(m.start, m.end);
      ta.scrollTop = top + lineHeight / 2 - ta.clientHeight / 2;
      // The textarea has its own scrollbar, but it can also be sitting off
      // screen: bring it into the page's view too.
      ta.scrollIntoView({ block: "nearest" });
      bandTop.current = top;
      placeBand();
    },
    [matches, placeBand, textareaRef, value],
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
      <div ref={bandRef} className="find-replace-band" aria-hidden="true" />
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

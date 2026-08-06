"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconSettings } from "@tabler/icons-react";

import {
  businessDaysFrom,
  formatDeadlineShortEs,
  formatMonthEs,
  monthMatrix,
  monthOf,
  shiftMonth,
  todayInMexico,
  TWO_WORKING_WEEKS,
  WORKING_WEEK,
} from "@/lib/business-days";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * When a round of testing closes: two presets and a calendar, behind a gear.
 *
 * The browser's own date input was the first thing here, and it looked like
 * the browser's: `dd/mm/aaaa` in a font nobody chose, a picker that belongs to
 * the operating system, and no room for "five business days from today", which
 * is how this decision is actually made. Drawing the month is thirty lines and
 * the arithmetic behind it is already tested (lib/business-days.ts).
 *
 * Picking a day commits immediately and closes: this is one decision, so a
 * Save button would only add a way to leave it half made.
 */
export function DeadlinePicker({
  value,
  onChange,
  disabled = false,
}: {
  /** YYYY-MM-DD, or null for a link with no deadline. */
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value ?? todayInMexico()));
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Reopening on a link whose date was changed elsewhere should land on that
  // date's month, not on wherever the last paging left off.
  useEffect(() => {
    if (open) setMonth(monthOf(value ?? todayInMexico()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const today = todayInMexico();

  function choose(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="deadline-picker" ref={rootRef}>
      <button
        type="button"
        className="deadline-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Cambiar la fecha de cierre"
      >
        <IconSettings size={14} stroke={1.5} />
        <span>{value ? `Cierra el ${formatDeadlineShortEs(value)}` : "Sin fecha de cierre"}</span>
      </button>

      {open && (
        <>
          <div className="chip-select-backdrop" onClick={() => setOpen(false)} />
          <div className="deadline-panel" role="dialog" aria-label="Fecha de cierre">
            <div className="deadline-presets">
              <button
                type="button"
                onClick={() => choose(businessDaysFrom(today, WORKING_WEEK))}
              >
                5 días hábiles
              </button>
              <button
                type="button"
                onClick={() => choose(businessDaysFrom(today, TWO_WORKING_WEEKS))}
              >
                10 días hábiles
              </button>
            </div>

            <div className="deadline-month">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMonth(shiftMonth(month, -1))}
                aria-label="Mes anterior"
              >
                <IconChevronLeft size={15} />
              </button>
              <span>{formatMonthEs(month)}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMonth(shiftMonth(month, 1))}
                aria-label="Mes siguiente"
              >
                <IconChevronRight size={15} />
              </button>
            </div>

            <div className="deadline-grid">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="deadline-weekday">
                  {d}
                </span>
              ))}
              {monthMatrix(month).map((cell) => (
                <button
                  key={cell.iso}
                  type="button"
                  className={`deadline-day${cell.inMonth ? "" : " is-outside"}${
                    cell.iso === value ? " is-selected" : ""
                  }${cell.iso === today ? " is-today" : ""}`}
                  onClick={() => choose(cell.iso)}
                >
                  {cell.day}
                </button>
              ))}
            </div>

            <button type="button" className="deadline-clear" onClick={() => choose(null)}>
              Sin fecha de cierre
            </button>
          </div>
        </>
      )}
    </div>
  );
}

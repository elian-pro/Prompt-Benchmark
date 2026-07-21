"use client";

import { useState, type ReactNode } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";

export type SearchableChipItem = { id: string; label: string; meta?: string };

type Props = {
  icon: ReactNode;
  /** Text on the trigger when nothing is selected. */
  placeholder: string;
  searchPlaceholder: string;
  items: SearchableChipItem[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  emptyText?: string;
  disabled?: boolean;
};

/**
 * A chip trigger that opens a searchable, filter-as-you-type list, reusing
 * the chip-select panel styles from ClientChip. Unlike a native <select>, the
 * whole list is filterable inline and every item is visible, which the plain
 * <select> the binding modal used at first could not do well.
 */
export function SearchableChip({
  icon,
  placeholder,
  searchPlaceholder,
  items,
  value,
  onChange,
  loading,
  emptyText = "Sin resultados.",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = items.find((i) => i.id === value) ?? null;
  const term = search.trim().toLowerCase();
  const filtered = term
    ? items.filter((i) =>
        [i.label, i.meta].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)),
      )
    : items;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="chip-select">
      <button
        type="button"
        className={`chip-select-trigger${selected ? " is-set" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
      >
        {icon}
        <span>{selected ? selected.label : placeholder}</span>
        {!disabled && <IconChevronDown size={13} />}
      </button>

      {open && (
        <>
          <div className="chip-select-backdrop" onClick={() => setOpen(false)} />
          <div className="chip-select-panel" role="dialog">
            <div className="chip-select-search">
              <IconSearch size={13} className="muted" />
              <input
                className="chip-select-search-input"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="chip-select-list">
              {loading && <p className="chip-select-note">Cargando…</p>}
              {!loading && filtered.length === 0 && (
                <p className="chip-select-note">{emptyText}</p>
              )}
              {!loading &&
                filtered.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className={`chip-select-item${i.id === value ? " is-selected" : ""}`}
                    onClick={() => pick(i.id)}
                  >
                    <span className="chip-select-item-name">{i.label}</span>
                    {i.meta && <span className="chip-select-item-meta">{i.meta}</span>}
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

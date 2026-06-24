"use client";

import { SEGMENT_OPTIONS } from "@/lib/segments";

type Props = {
  /** Empty string means no segment selected. */
  value: string;
  onChange: (value: string) => void;
};

/**
 * Single-select chips for the client segment. Clicking the active chip clears
 * the selection (the field is optional). A value that isn't one of the presets
 * — e.g. a legacy free-text segment — is shown as an extra selected chip so it
 * isn't silently dropped.
 */
export function SegmentPicker({ value, onChange }: Props) {
  const presets: readonly string[] = SEGMENT_OPTIONS;
  const options =
    !value || presets.includes(value) ? presets : [...presets, value];

  return (
    <div className="chip-group" role="group" aria-label="Segmento">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            className={`chip${selected ? " chip-selected" : ""}`}
            aria-pressed={selected}
            onClick={() => onChange(selected ? "" : opt)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

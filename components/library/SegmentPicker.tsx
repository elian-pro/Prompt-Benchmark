"use client";

import { useEffect, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import type { Segment } from "@/lib/db/segments";
import { SEGMENT_OPTIONS } from "@/lib/segments";

type Props = {
  /** Empty string means no segment selected. */
  value: string;
  onChange: (value: string) => void;
};

/**
 * Open segment field: preset chips (loaded from the DB, with the built-in
 * defaults as a fallback) plus a free-text input for anything that doesn't fit
 * a preset. A typed value that isn't a preset can be saved as a new preset with
 * "Guardar". The selected segment — chip or typed — is highlighted in accent.
 */
export function SegmentPicker({ value, onChange }: Props) {
  const [presets, setPresets] = useState<string[]>([...SEGMENT_OPTIONS]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/segments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((rows: Segment[]) => {
        if (!active) return;
        setPresets(mergePresets(rows.map((r) => r.name)));
      })
      .catch(() => {
        /* Table may not exist yet (migration pending) — keep the defaults. */
      });
    return () => {
      active = false;
    };
  }, []);

  const trimmed = value.trim();
  const matchesPreset = presets.some((p) => p.toLowerCase() === trimmed.toLowerCase());
  const canSave = trimmed.length > 0 && !matchesPreset && !saving;

  async function savePreset() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const row: Segment = await res.json();
        setPresets((prev) => mergePresets([...prev, row.name]));
        onChange(row.name);
      }
    } catch {
      /* Saving the preset is optional; the value is still usable as free text. */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="segment-field">
      <div className="seg-chip-group" role="group" aria-label="Segmento">
        {presets.map((name) => {
          const selected = trimmed.toLowerCase() === name.toLowerCase();
          return (
            <button
              key={name}
              type="button"
              className={`seg-chip${selected ? " seg-chip-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : name)}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="segment-input-row">
        <input
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="O escribe un segmento…"
        />
        {canSave && (
          <button type="button" className="segment-save" onClick={savePreset}>
            <IconPlus size={14} />
            Guardar
          </button>
        )}
      </div>
    </div>
  );
}

/** Dedupe case-insensitively, keeping the built-in defaults first. */
function mergePresets(names: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const n of [...SEGMENT_OPTIONS, ...names]) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(n);
    }
  }
  return merged;
}

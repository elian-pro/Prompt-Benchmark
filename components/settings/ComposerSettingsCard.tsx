"use client";

import { useState } from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import type { ComposerSettings } from "@/lib/db/composer-settings";
import {
  SMART_PASTE_THRESHOLD_MIN,
  SMART_PASTE_THRESHOLD_MAX,
  clampThreshold,
} from "@/lib/smart-paste";
import { Button } from "@/components/ui/Button";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

/**
 * Smart Paste settings (Sprint 15): one shared toggle + threshold for the
 * whole team (this app has no per-user accounts). Below the threshold, a
 * paste into the Editor/Creator composer inserts as plain text as always;
 * at or above it, it becomes a removable .txt attachment instead.
 */
export function ComposerSettingsCard({
  settings,
  onSaved,
  onToast,
}: {
  settings: ComposerSettings;
  onSaved: (next: ComposerSettings) => void;
  onToast: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(settings.smart_paste_enabled);
  const [threshold, setThreshold] = useState(String(settings.smart_paste_threshold));
  const [busy, setBusy] = useState(false);

  const parsed = Number(threshold);
  const thresholdValid = Number.isInteger(parsed) && !Number.isNaN(parsed);
  const dirty =
    enabled !== settings.smart_paste_enabled ||
    (thresholdValid && parsed !== settings.smart_paste_threshold);

  // Out-of-range values snap to the nearest limit on blur, with a brief
  // notice, rather than blocking save with a validation error.
  function onThresholdBlur() {
    const n = Number(threshold);
    if (!Number.isInteger(n) || Number.isNaN(n)) {
      setThreshold(String(settings.smart_paste_threshold));
      return;
    }
    const clamped = clampThreshold(n);
    if (clamped !== n) {
      setThreshold(String(clamped));
      onToast(`Ajustado al límite permitido: ${clamped} caracteres.`);
    }
  }

  async function save() {
    if (!thresholdValid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/composer-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smart_paste_enabled: enabled,
          smart_paste_threshold: clampThreshold(parsed),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar la configuración.");
      }
      const next: ComposerSettings = await res.json();
      setThreshold(String(next.smart_paste_threshold));
      onSaved(next);
      onToast("Smart Paste actualizado.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard title="Composición de mensajes">
      <p className="prompt-card-note">
        Cuando pegas un bloque de texto largo en el chat del Editor o el Creator, se
        convierte automáticamente en un adjunto en vez de llenar el campo de mensaje.
      </p>

      <label className="switch-inline" style={{ cursor: "pointer", marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={busy}
        />
        <span>Activar Smart Paste</span>
      </label>

      <div className="range-field">
        <div className="range-field-head">
          <span className="param-label">Umbral (caracteres)</span>
        </div>
        <input
          className="input"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={onThresholdBlur}
          inputMode="numeric"
          disabled={busy || !enabled}
        />
        <p className="field-hint">
          Entre {SMART_PASTE_THRESHOLD_MIN} y {SMART_PASTE_THRESHOLD_MAX} caracteres. Un
          párrafo pegado que llegue a este tamaño se convierte en archivo.
        </p>
      </div>

      <div className="prompt-card-actions">
        <Button
          variant="primary"
          icon={<IconDeviceFloppy size={14} />}
          onClick={save}
          disabled={busy || !dirty || !thresholdValid}
        >
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </CollapsibleCard>
  );
}

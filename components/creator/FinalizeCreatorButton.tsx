"use client";

import { useState } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SegmentPicker } from "@/components/library/SegmentPicker";

type FinalizeResult = {
  session: unknown;
  version: { id: string; version_number: string };
  client: { id: string; name: string };
};

type Props = {
  sessionId: string;
  /** Disabled until a prompt has actually been built (draft non-empty). */
  disabled?: boolean;
  onDone: (result: FinalizeResult) => void;
  onError: (message: string) => void;
};

/**
 * Finalizes a Creator session: collects the new client's metadata and commits
 * the built prompt as that client's v1.0 (S3-T7). The client doesn't exist
 * until now, so the name is required here rather than at session start.
 */
export function FinalizeCreatorButton({ sessionId, disabled, onDone, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          segment: segment.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo finalizar la creación.");
      setOpen(false);
      onDone(data as FinalizeResult);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error al finalizar la creación.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        icon={<IconCircleCheck size={14} />}
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        Finalizar creación
      </Button>

      {open && (
        <Modal
          open={open}
          onClose={() => !busy && setOpen(false)}
          title="Finalizar creación"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={submit} disabled={busy || !name.trim()}>
                {busy ? "Guardando…" : "Guardar como nuevo cliente"}
              </Button>
            </>
          }
        >
          <p className="field-hint" style={{ marginBottom: 16 }}>
            Se creará un cliente nuevo en la Biblioteca con este prompt como su
            versión v1.0.
          </p>
          <div className="field">
            <label className="field-label">Nombre del cliente</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Inmobiliaria del Valle"
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label">Segmento (opcional)</label>
            <SegmentPicker value={segment} onChange={setSegment} />
          </div>
        </Modal>
      )}
    </>
  );
}

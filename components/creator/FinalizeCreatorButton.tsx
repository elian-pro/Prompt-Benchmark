"use client";

import { useState } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SegmentPicker } from "@/components/library/SegmentPicker";
import { ClientChip, type ClientChipValue } from "@/components/sessions/ClientChip";

type FinalizeResult = {
  session: unknown;
  version: { id: string; version_number: string };
  client: { id: string; name: string };
};

type Props = {
  sessionId: string;
  /** The client picked when the session started, if any. */
  boundClientId?: string | null;
  boundClientName?: string | null;
  /** Disabled until a prompt has actually been built (draft non-empty). */
  disabled?: boolean;
  onDone: (result: FinalizeResult) => void;
  onError: (message: string) => void;
};

/**
 * Finalizes a Creator session: commits the built prompt either as a new
 * version of an existing client, or as the v1.0 of a client created right
 * here. The target defaults to whatever the session was started with, and can
 * still be changed, which is the only way an already-running session that
 * forgot to pick one ever reaches its client.
 */
export function FinalizeCreatorButton({
  sessionId,
  boundClientId,
  boundClientName,
  disabled,
  onDone,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ClientChipValue>(
    boundClientId && boundClientName
      ? { kind: "client", id: boundClientId, name: boundClientName }
      : { kind: "scratch" },
  );
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [busy, setBusy] = useState(false);

  const toExisting = target?.kind === "client";
  const canSubmit = !busy && (toExisting || name.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toExisting
            ? { clientId: target.id }
            : { name: name.trim(), segment: segment.trim() || null },
        ),
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
              <Button variant="primary" onClick={submit} disabled={!canSubmit}>
                {busy
                  ? "Guardando…"
                  : toExisting
                    ? `Guardar en ${target.name}`
                    : "Guardar como nuevo cliente"}
              </Button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">Cliente</label>
            <ClientChip mode="target" value={target} onChange={setTarget} disabled={busy} />
          </div>

          {toExisting ? (
            <p className="field-hint">
              El prompt se guardará en &quot;{target.name}&quot;. Si es su primera versión
              reemplaza la v1.0 vacía; si no, se guarda como versión nueva.
            </p>
          ) : (
            <>
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
            </>
          )}
        </Modal>
      )}
    </>
  );
}

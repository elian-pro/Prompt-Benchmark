"use client";

import { useState } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type FinalizeResult = {
  session: unknown;
  version: { id: string; version_number: string };
};

type Props = {
  sessionId: string;
  /** Disabled when the draft is empty or the session is no longer active. */
  disabled?: boolean;
  onDone: (result: FinalizeResult) => void;
  onError: (message: string) => void;
};

/**
 * Commits the session's current draft as a new minor version (S2-T9). Asks for
 * confirmation first (in the app's own modal, not a native confirm() popup)
 * since finalizing closes the session for further edits.
 */
export function FinalizeButton({ sessionId, disabled, onDone, onError }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finalize() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}/finalize`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo finalizar la edición.");
      setConfirming(false);
      onDone(data as FinalizeResult);
    } catch (e) {
      setConfirming(false);
      onError(e instanceof Error ? e.message : "Error al finalizar la edición.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        icon={<IconCircleCheck size={14} />}
        onClick={() => setConfirming(true)}
        disabled={busy || disabled}
      >
        Finalizar edición
      </Button>

      {confirming && (
        <Modal
          open
          onClose={() => !busy && setConfirming(false)}
          title="¿Finalizar edición?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={finalize} disabled={busy}>
                {busy ? "Finalizando…" : "Finalizar edición"}
              </Button>
            </>
          }
        >
          <p className="modal-body">
            Esto creará una nueva versión menor en la Biblioteca y cerrará la sesión.
          </p>
        </Modal>
      )}
    </>
  );
}

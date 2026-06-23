"use client";

import { useState } from "react";
import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";

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
 * confirmation first since finalizing closes the session for further edits.
 */
export function FinalizeButton({ sessionId, disabled, onDone, onError }: Props) {
  const [busy, setBusy] = useState(false);

  async function finalize() {
    if (busy) return;
    const ok = window.confirm(
      "Esto creará una nueva versión menor en la Biblioteca y cerrará la sesión. ¿Finalizar la edición?",
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/chat-sessions/${sessionId}/finalize`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo finalizar la edición.");
      onDone(data as FinalizeResult);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error al finalizar la edición.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="primary"
      icon={<IconCircleCheck size={14} />}
      onClick={finalize}
      disabled={busy || disabled}
    >
      {busy ? "Finalizando…" : "Finalizar edición"}
    </Button>
  );
}

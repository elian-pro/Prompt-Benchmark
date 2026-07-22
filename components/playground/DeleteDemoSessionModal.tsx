"use client";

import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";

type Props = {
  sessionId: string;
  onClose: () => void;
  onDone: () => void;
};

/**
 * Deletes a single Playground conversation: single-step confirmation, no typed
 * phrase (same low-stakes pattern as the Editor's DeleteSessionModal). The
 * cascade removes its messages and notes.
 */
export function DeleteDemoSessionModal({ sessionId, onClose, onDone }: Props) {
  async function confirm() {
    const res = await fetch(`/api/demo-sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo eliminar la conversación.");
    }
    onDone();
  }

  return (
    <DangerConfirmModal
      onClose={onClose}
      onConfirm={confirm}
      confirmTitle="¿Eliminar esta conversación?"
      consequences={[
        "Se borrará la conversación completa y sus notas.",
        "Esta acción no se puede deshacer.",
      ]}
    />
  );
}

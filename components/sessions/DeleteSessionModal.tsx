"use client";

import type { ChatSessionListItem } from "@/lib/db/chat-sessions";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";

type Props = {
  session: ChatSessionListItem;
  onClose: () => void;
  onDone: () => void;
};

/**
 * Session deletion: single-step confirmation, no typed phrase — a chat
 * session carries far less at stake than a client (see DeleteClientModal).
 */
export function DeleteSessionModal({ session, onClose, onDone }: Props) {
  async function confirm() {
    const res = await fetch(`/api/chat-sessions/${session.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo eliminar la sesión.");
    }
    onDone();
  }

  return (
    <DangerConfirmModal
      onClose={onClose}
      onConfirm={confirm}
      confirmTitle="¿Eliminar esta sesión?"
      consequences={[
        "Se borrará toda la conversación.",
        "Esta acción no se puede deshacer.",
      ]}
    />
  );
}

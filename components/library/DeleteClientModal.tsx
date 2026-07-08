"use client";

import type { ClientSummary } from "@/lib/db/clients";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";

type Props = {
  client: ClientSummary;
  onClose: () => void;
  onDone: () => void;
};

/** Client deletion: two-step (soft warning with Archive alternative →
 *  typed confirmation), built on the shared DangerConfirmModal. */
export function DeleteClientModal({ client, onClose, onDone }: Props) {
  async function call(url: string, method: string, errMsg: string) {
    const res = await fetch(url, { method });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? errMsg);
    }
    onDone();
  }

  return (
    <DangerConfirmModal
      onClose={onClose}
      onConfirm={() =>
        call(`/api/clients/${client.id}`, "DELETE", "No se pudo eliminar.")
      }
      warning={{
        title: `¿Eliminar "${client.name}"?`,
        body: "Esta acción es permanente. Si solo quieres ocultarlo de la biblioteca, considera archivarlo: podrás restaurarlo más tarde.",
        secondary: {
          label: "Archivar",
          onAction: () =>
            call(
              `/api/clients/${client.id}/archive`,
              "POST",
              "No se pudo archivar.",
            ),
        },
      }}
      consequences={[
        client.version_count === 1
          ? "Se perderá 1 versión."
          : `Se perderán ${client.version_count} versiones.`,
        "Se borrarán los chats y el historial asociado.",
        "Esta acción no se puede deshacer.",
      ]}
      confirmPhrase={client.name}
    />
  );
}

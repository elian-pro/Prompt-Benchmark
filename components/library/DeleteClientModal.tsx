"use client";

import { useEffect, useState } from "react";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import type { ClientSummary } from "@/lib/db/clients";
import { Button } from "@/components/ui/Button";

type Props = {
  client: ClientSummary;
  onClose: () => void;
  onDone: () => void;
};

export function DeleteClientModal({ client, onClose, onDone }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(url: string, method: string, errMsg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? errMsg);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setBusy(false);
    }
  }

  const archive = () =>
    run(`/api/clients/${client.id}/archive`, "POST", "No se pudo archivar.");
  const remove = () =>
    run(`/api/clients/${client.id}`, "DELETE", "No se pudo eliminar.");

  const canDelete = confirmText.trim() === client.name;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 1 ? (
          <>
            <IconAlertTriangle size={28} className="modal-icon icon-accent" />
            <h2 className="modal-title">¿Eliminar &quot;{client.name}&quot;?</h2>
            <p className="modal-body">
              Esta acción es permanente. Si solo quieres ocultarlo de la
              biblioteca, considera archivarlo: podrás restaurarlo más tarde.
            </p>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-footer-3">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={archive} disabled={busy}>
                Archivar
              </Button>
              <Button variant="danger" onClick={() => setStep(2)} disabled={busy}>
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <>
            <IconTrash size={28} className="modal-icon icon-danger" />
            <h2 className="modal-title">¿Estás seguro?</h2>
            <ul className="consequences">
              <li>Se perderán las {client.version_count} versiones.</li>
              <li>Se borrarán los chats y el historial asociado.</li>
              <li>Esta acción no se puede deshacer.</li>
            </ul>
            <div className="field">
              <label className="field-label">
                Escribe el nombre del cliente para confirmar
              </label>
              <input
                className="input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={client.name}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-footer">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={remove}
                disabled={busy || !canDelete}
              >
                {busy ? "Eliminando…" : "Sí, eliminar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

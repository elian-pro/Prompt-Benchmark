"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";

type SecondaryAction = { label: string; onAction: () => Promise<void> };

type Props = {
  /** Close without acting (cancel / overlay / Escape). */
  onClose: () => void;
  /** The destructive action. Must throw on failure; on success the parent
   *  unmounts this modal (it does not auto-close). */
  onConfirm: () => Promise<void>;
  /** Optional soft-warning first step (design system §Modals step 1). When
   *  omitted, the modal opens straight on the destructive confirmation. */
  warning?: {
    title: string;
    body: ReactNode;
    /** Middle action, e.g. "Archivar" — a non-destructive alternative. */
    secondary?: SecondaryAction;
    continueLabel?: string;
  };
  /** Destructive step title. Defaults to "¿Estás seguro?". */
  confirmTitle?: string;
  /** Bullet list of consequences shown on the destructive step. */
  consequences?: ReactNode[];
  /** When set, the user must type this exact phrase to enable confirm. */
  confirmPhrase?: string;
  confirmLabel?: string;
  busyLabel?: string;
};

export function DangerConfirmModal({
  onClose,
  onConfirm,
  warning,
  confirmTitle = "¿Estás seguro?",
  consequences,
  confirmPhrase,
  confirmLabel = "Sí, eliminar",
  busyLabel = "Eliminando…",
}: Props) {
  const [step, setStep] = useState<"warn" | "confirm">(
    warning ? "warn" : "confirm",
  );
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function runAction(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      // On success the parent unmounts this modal — keep busy to avoid flicker.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setBusy(false);
    }
  }

  const typedOk = !confirmPhrase || typed.trim() === confirmPhrase;

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "warn" && warning ? (
          <>
            <IconAlertTriangle size={28} className="modal-icon icon-accent" />
            <h2 className="modal-title">{warning.title}</h2>
            <p className="modal-body">{warning.body}</p>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-footer-3">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              {warning.secondary && (
                <Button
                  variant="secondary"
                  onClick={() => runAction(warning.secondary!.onAction)}
                  disabled={busy}
                >
                  {warning.secondary.label}
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => setStep("confirm")}
                disabled={busy}
              >
                {warning.continueLabel ?? "Continuar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <IconTrash size={28} className="modal-icon icon-danger" />
            <h2 className="modal-title">{confirmTitle}</h2>
            {consequences && consequences.length > 0 && (
              <ul className="consequences">
                {consequences.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            {confirmPhrase && (
              <div className="field">
                <label className="field-label">
                  Escribe «{confirmPhrase}» para confirmar
                </label>
                <input
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmPhrase}
                />
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
            <div className="modal-footer">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => runAction(onConfirm)}
                disabled={busy || !typedOk}
              >
                {busy ? busyLabel : confirmLabel}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

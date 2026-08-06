"use client";

import { useState } from "react";
import { IconDeviceFloppy, IconSend } from "@tabler/icons-react";

import { Button } from "@/components/ui/Button";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

export type GoogleChatConfig = {
  space_name: string | null;
  space_display_name: string | null;
  /** Whether the server has the service account env vars. */
  configured: boolean;
};

type Space = { name: string; displayName: string };

/**
 * Where a client's report lands outside the app.
 *
 * The service account lives in the server's environment, so this card only
 * chooses the space. When the server has no credentials it says which ones are
 * missing rather than offering an empty select, and the "Enviar prueba" button
 * exists because a misconfigured Chat app otherwise fails silently: the
 * notification itself is fire and forget, so "nothing arrived" would have
 * nowhere to explain itself.
 */
export function GoogleChatCard({
  config,
  onSaved,
  onToast,
}: {
  config: GoogleChatConfig;
  onSaved: (next: GoogleChatConfig) => void;
  onToast: (message: string) => void;
}) {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [spaceName, setSpaceName] = useState(config.space_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (spaceName || null) !== (config.space_name ?? null);

  /** Loaded when the card opens, not on every page load: it is a call to
   *  Google, and Settings has plenty of other reasons to render. */
  async function loadSpaces() {
    if (spaces || !config.configured) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/google-chat/spaces");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron leer los espacios.");
      setSpaces(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al leer los espacios.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const chosen = spaces?.find((s) => s.name === spaceName);
      const res = await fetch("/api/integrations/google-chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceName: spaceName || null,
          spaceDisplayName: chosen?.displayName ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      onSaved({ ...data, configured: config.configured });
      onToast(spaceName ? "Los reportes van a llegar a ese espacio." : "Avisos desactivados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/google-chat/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar la prueba.");
      onToast("Mensaje de prueba enviado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar la prueba.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      title="Avisos en Google Chat"
      hint={config.space_name ? config.space_display_name ?? "Activo" : undefined}
      onOpen={loadSpaces}
    >
      <p className="prompt-card-note">
        Cuando un cliente deja un reporte en su link de pruebas, llega un mensaje al espacio que
        elijas. El aviso de la campana sigue funcionando igual.
      </p>

      {!config.configured ? (
        <p className="field-hint">
          Falta la cuenta de servicio en el servidor: <code>GOOGLE_CHAT_CLIENT_EMAIL</code> y{" "}
          <code>GOOGLE_CHAT_PRIVATE_KEY</code>. Mientras no estén, no se manda nada.
        </p>
      ) : (
        <>
          <div className="field">
            <label className="field-label">Espacio</label>
            <select
              className="select"
              value={spaceName}
              onChange={(e) => setSpaceName(e.target.value)}
              disabled={busy}
            >
              <option value="">Ninguno (avisos desactivados)</option>
              {/* The saved space stays selectable before the list loads, so
                  opening the card never looks like it lost the setting. */}
              {!spaces && config.space_name && (
                <option value={config.space_name}>
                  {config.space_display_name ?? config.space_name}
                </option>
              )}
              {spaces?.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.displayName}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Solo aparecen los espacios donde la app de Chat ya está agregada.
            </p>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="prompt-card-actions">
            <span className="prompt-card-disclaimer">
              La prueba manda un mensaje real al espacio elegido.
            </span>
            <Button
              variant="secondary"
              icon={<IconSend size={14} />}
              onClick={sendTest}
              disabled={busy || !config.space_name}
            >
              Enviar prueba
            </Button>
            <Button
              variant="primary"
              icon={<IconDeviceFloppy size={14} />}
              onClick={save}
              disabled={busy || !dirty}
            >
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}

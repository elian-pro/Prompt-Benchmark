"use client";

import { useState } from "react";
import { IconCopy, IconDeviceFloppy } from "@tabler/icons-react";
import type { PromptRole } from "@/lib/db/prompt-overrides";
import { Button } from "@/components/ui/Button";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

/**
 * A collapsible card exposing one of the app's system prompts. The team can
 * edit and SAVE it: a saved value is persisted (prompt_overrides) and used by
 * the app at runtime, replacing the code default. "Restaurar original" removes
 * the override so the role falls back to the code constant.
 *
 * `savedContent` is the persisted override (or null when none exists); the
 * card seeds its editor from it, falling back to `defaultText`.
 */
export function SystemPromptCard({
  role,
  title,
  description,
  defaultText,
  savedContent,
  onToast,
}: {
  role: PromptRole;
  title: string;
  description: string;
  defaultText: string;
  savedContent: string | null;
  onToast: (message: string) => void;
}) {
  // The value the app is currently using for this role.
  const [saved, setSaved] = useState<string | null>(savedContent);
  const [text, setText] = useState(savedContent ?? defaultText);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const effective = saved ?? defaultText;
  const dirty = text !== effective;
  const isOverridden = saved !== null;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/prompt-overrides/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar el prompt.");
      }
      setSaved(text);
      onToast(`System prompt de ${title.split(" ")[0]} guardado. La app ya lo usa.`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const res = await fetch(`/api/prompt-overrides/${role}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo restaurar el prompt.");
      }
      setSaved(null);
      setText(defaultText);
      onToast("System prompt restaurado al original.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Error al restaurar.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the text stays selectable in the textarea.
    }
  }

  const hint = dirty
    ? "Cambios sin guardar"
    : isOverridden
      ? "Personalizado · activo"
      : undefined;

  return (
    <CollapsibleCard title={title} hint={hint}>
      <p className="prompt-card-note">{description}</p>
      <textarea
        className="textarea prompt-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        disabled={busy}
      />
      <div className="prompt-card-actions">
        <span className="prompt-card-disclaimer">
          {isOverridden
            ? "La app usa esta versión guardada. El resto del mensaje (borrador o referencia) se agrega en tiempo real."
            : "La app usa el original. Guarda para que empiece a usar tu versión."}
        </span>
        {(isOverridden || dirty) && (
          <Button variant="ghost" onClick={restore} disabled={busy}>
            Restaurar original
          </Button>
        )}
        <Button variant="secondary" icon={<IconCopy size={14} />} onClick={copy} disabled={busy}>
          {copied ? "Copiado" : "Copiar"}
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
    </CollapsibleCard>
  );
}

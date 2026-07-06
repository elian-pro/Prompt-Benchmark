"use client";

import { useState } from "react";
import { IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";

/**
 * A collapsible card exposing one of the app's system prompts as a working
 * copy: the team can tweak the text and copy it out (e.g. to iterate on it
 * elsewhere), but nothing is persisted and the runtime keeps using the
 * constant from the code — by design, edits here never change app behavior.
 */
export function SystemPromptCard({
  title,
  description,
  defaultText,
}: {
  title: string;
  description: string;
  defaultText: string;
}) {
  const [text, setText] = useState(defaultText);
  const [copied, setCopied] = useState(false);
  const modified = text !== defaultText;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the text stays selectable in the textarea.
    }
  }

  return (
    <CollapsibleCard title={title} hint={modified ? "Editado · sin guardar" : undefined}>
      <p className="prompt-card-note">{description}</p>
      <textarea
        className="textarea prompt-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="prompt-card-actions">
        <span className="prompt-card-disclaimer">
          Este espacio no se guarda ni cambia el comportamiento de la app:
          edita y copia.
        </span>
        {modified && (
          <Button variant="ghost" onClick={() => setText(defaultText)}>
            Restaurar original
          </Button>
        )}
        <Button variant="secondary" icon={<IconCopy size={14} />} onClick={copy}>
          {copied ? "Copiado" : "Copiar prompt"}
        </Button>
      </div>
    </CollapsibleCard>
  );
}

"use client";

import type { N8nHost } from "@/lib/db/clients";

type Props = {
  value: N8nHost;
  onChange: (value: N8nHost) => void;
};

/**
 * Mandatory "where does this agent live" question, shared by the new-client
 * and import modals. Independent of BindOnCreateToggle: this is a quick tag
 * (drives the Library's yellow host badge) that's always answered, whereas
 * binding a specific n8n connection/workflow/node is a separate, optional
 * follow-up step that can happen later.
 */
export function N8nHostPicker({ value, onChange }: Props) {
  return (
    <div className="field">
      <label className="field-label">¿Dónde vive el agente?</label>
      <div className="chip-row">
        <button
          type="button"
          className={`chip${value === "zebra" ? " active" : ""}`}
          onClick={() => onChange("zebra")}
        >
          n8n de Zebra
        </button>
        <button
          type="button"
          className={`chip${value === "own" ? " active" : ""}`}
          onClick={() => onChange("own")}
        >
          n8n propio del cliente
        </button>
      </div>
    </div>
  );
}

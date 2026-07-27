"use client";

import { useEffect, useState } from "react";
import { IconTemplate } from "@tabler/icons-react";
import { SearchableChip } from "@/components/ui/SearchableChip";
import { chatsTableName } from "@/lib/chats-table-name";

export type TemplateOption = {
  connectionId: string;
  workflowId: string;
  connectionName: string;
  workflowName: string | null;
};

export type ProvisionChoice = {
  duplicateWorkflow: boolean;
  createChatsTable: boolean;
  template: TemplateOption | null;
};

type Props = {
  clientName: string;
  value: ProvisionChoice;
  onChange: (choice: ProvisionChoice) => void;
  disabled?: boolean;
};

/** The n8n name a client's workflow gets. Mirrors workflowNameFor on the server. */
function workflowNameFor(clientName: string): string {
  return `IA Mensajes ${clientName.trim()}`;
}

/**
 * The two provisioning checkboxes for the Nuevo cliente / Importar modals:
 * duplicate the n8n template as "IA Mensajes <Cliente>", and create the
 * chats_<Cliente> history table. Both default to checked, and each one hides
 * itself when it is not configured, so the modal never offers an option that
 * can only fail.
 */
export function ProvisionFields({ clientName, value, onChange, disabled }: Props) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [chatsReady, setChatsReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/provisioning-options")
      .then((r) => (r.ok ? r.json() : { templates: [], chatsReady: false }))
      .then((data: { templates: TemplateOption[]; chatsReady: boolean }) => {
        if (!alive) return;
        setTemplates(data.templates ?? []);
        setChatsReady(Boolean(data.chatsReady));
        setLoaded(true);
        // Preselect the first template so the default path needs no clicks.
        if (data.templates?.length) onChange({ ...value, template: data.templates[0] });
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
    // Runs once on mount: the options do not change while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const table = chatsTableName(clientName);
  const canDuplicate = templates.length > 0;
  if (!loaded || (!canDuplicate && !chatsReady)) return null;

  return (
    <>
      {canDuplicate && (
        <div className="field">
          <label className="switch-inline" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={value.duplicateWorkflow}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, duplicateWorkflow: e.target.checked })}
            />
            <span>
              Duplicar el flujo de n8n como &laquo;
              {clientName.trim() ? workflowNameFor(clientName) : "IA Mensajes {Cliente}"}&raquo;
            </span>
          </label>
          {value.duplicateWorkflow && templates.length > 1 && (
            <SearchableChip
              icon={<IconTemplate size={14} />}
              placeholder="Elige la plantilla"
              searchPlaceholder="Buscar plantilla…"
              items={templates.map((t) => ({
                id: t.connectionId,
                label: t.workflowName ?? t.workflowId,
                meta: t.connectionName,
              }))}
              value={value.template?.connectionId ?? ""}
              onChange={(id) =>
                onChange({
                  ...value,
                  template: templates.find((t) => t.connectionId === id) ?? null,
                })
              }
              disabled={disabled}
            />
          )}
          {value.duplicateWorkflow && templates.length === 1 && (
            <p className="field-hint">
              Plantilla: {templates[0].workflowName ?? templates[0].workflowId} (
              {templates[0].connectionName})
            </p>
          )}
        </div>
      )}

      {chatsReady && (
        <div className="field">
          <label className="switch-inline" style={{ cursor: table ? "pointer" : "default" }}>
            <input
              type="checkbox"
              checked={value.createChatsTable && Boolean(table)}
              disabled={disabled || !table}
              onChange={(e) => onChange({ ...value, createChatsTable: e.target.checked })}
            />
            <span>
              Crear la tabla de historial &laquo;{table ?? "chats_{Cliente}"}&raquo;
            </span>
          </label>
          {clientName.trim() && !table && (
            <p className="field-hint">
              Ese nombre no produce un nombre de tabla válido: necesita al menos una letra o un
              número.
            </p>
          )}
        </div>
      )}
    </>
  );
}

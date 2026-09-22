"use client";

import { useEffect, useState } from "react";
import { IconTemplate } from "@tabler/icons-react";
import { SearchableChip } from "@/components/ui/SearchableChip";
import { chatsTableName } from "@/lib/chats-table-name";
import { CRMS, DEFAULT_CRM, type Crm } from "@/lib/crm";

export type TemplateOption = {
  crm: Crm;
  connectionId: string;
  workflowId: string;
  connectionName: string;
  workflowName: string | null;
};

export type ProvisionChoice = {
  duplicateWorkflow: boolean;
  createChatsTable: boolean;
  crm: Crm;
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
 *
 * The CRM chips follow the same rule: they only appear once more than one CRM
 * has a template configured, and Kommo stays selected by default.
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
        // Preselect Kommo's template so the default path needs no clicks. Only
        // an instance without a Kommo template falls back to whatever is there.
        const first =
          data.templates?.find((t) => t.crm === DEFAULT_CRM) ?? data.templates?.[0] ?? null;
        if (first) onChange({ ...value, crm: first.crm, template: first });
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
  // Templates for the CRM in play. More than one means more than one n8n
  // connection carries a template for it, and the user picks which.
  const forCrm = templates.filter((t) => t.crm === value.crm);
  const crms = CRMS.filter((c) => templates.some((t) => t.crm === c.id));

  function chooseCrm(crm: Crm) {
    onChange({
      ...value,
      crm,
      template: templates.find((t) => t.crm === crm) ?? null,
    });
  }
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
          {value.duplicateWorkflow && crms.length > 1 && (
            <>
              <label className="field-label" style={{ marginTop: "0.75rem" }}>
                CRM
              </label>
              <div className="chip-row">
                {crms.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip${value.crm === c.id ? " active" : ""}`}
                    onClick={() => chooseCrm(c.id)}
                    disabled={disabled}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {value.duplicateWorkflow && forCrm.length > 1 && (
            <SearchableChip
              icon={<IconTemplate size={14} />}
              placeholder="Elige la plantilla"
              searchPlaceholder="Buscar plantilla…"
              items={forCrm.map((t) => ({
                id: t.connectionId,
                label: t.workflowName ?? t.workflowId,
                meta: t.connectionName,
              }))}
              value={value.template?.connectionId ?? ""}
              onChange={(id) =>
                onChange({
                  ...value,
                  template: forCrm.find((t) => t.connectionId === id) ?? null,
                })
              }
              disabled={disabled}
            />
          )}
          {value.duplicateWorkflow && forCrm.length === 1 && (
            <p className="field-hint">
              Plantilla: {forCrm[0].workflowName ?? forCrm[0].workflowId} (
              {forCrm[0].connectionName})
            </p>
          )}
          {value.duplicateWorkflow && forCrm.length === 0 && (
            <p className="field-hint">
              Esa opción no tiene flujo plantilla configurado. Elígelo en Ajustes, en la conexión
              de n8n.
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

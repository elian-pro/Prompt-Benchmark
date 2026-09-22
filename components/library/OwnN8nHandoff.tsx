"use client";

import { useEffect, useState } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFileCode,
  IconDatabase,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { CRMS, type Crm } from "@/lib/crm";
import { buildCreateChatsTableSql, chatsTableName } from "@/lib/chats-table-name";

type Props = {
  clientId: string;
  clientName: string;
  crm: Crm;
  onCrmChange: (crm: Crm) => void;
};

/**
 * What the client detail shows instead of the deployment cards when the agent
 * lives in the CLIENT's n8n: we cannot duplicate a flow into an instance we do
 * not reach, nor create a table in a database that is not ours, so the team
 * hands over the two artifacts and the client's own people run them.
 *
 * Both are the real thing, not a documented approximation: the JSON is the
 * copy the provisioning would have created (retargeted and renamed, minus our
 * credentials) and the SQL is the same DDL `createChatsTable` runs, without
 * the grants to roles that only exist in our database.
 */
export function OwnN8nHandoff({ clientId, clientName, crm, onCrmChange }: Props) {
  const [crms, setCrms] = useState(CRMS);
  const [json, setJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openJson, setOpenJson] = useState(false);
  const [openSql, setOpenSql] = useState(false);
  const [copied, setCopied] = useState<"json" | "sql" | null>(null);

  // A CRM with no template configured anywhere is not offered: its chip could
  // only ever produce the "sin plantilla" error. Same rule as the Nuevo
  // cliente modal.
  useEffect(() => {
    fetch("/api/provisioning-options")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { templates?: { crm: Crm }[] } | null) => {
        const ids = new Set((data?.templates ?? []).map((t) => t.crm));
        if (ids.size) setCrms(CRMS.filter((c) => ids.has(c.id)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/clients/${clientId}/template-export?crm=${crm}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) throw new Error(data.error ?? "No se pudo preparar el flujo.");
        setJson(data.json as string);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setJson(null);
        setError(e instanceof Error ? e.message : "Error inesperado.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId, crm]);

  const schema = chatsTableName(clientName);
  // No grants: n8n_writer and metabase_app are roles of OUR database, and
  // granting to a role that does not exist aborts the whole script.
  const sql = schema ? buildCreateChatsTableSql(schema, { grants: false }) : null;

  async function copy(what: "json" | "sql", text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied((v) => (v === what ? null : v)), 1800);
  }

  return (
    <>
      <div className="n8n-card">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <p className="section-label" style={{ margin: 0 }}>
            Plantilla del flujo
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={<IconCopy size={13} />}
            onClick={() => json && copy("json", json)}
            disabled={!json}
          >
            {copied === "json" ? "Copiado" : "Copiar JSON"}
          </Button>
        </div>

        <p className="field-hint" style={{ marginTop: 0 }}>
          El agente vive en el n8n del cliente, así que el flujo se entrega para importarlo. Va
          renombrado &laquo;IA Mensajes {clientName.trim()}&raquo;, escribiendo en el esquema
          &laquo;{schema ?? clientName.trim()}&raquo; y sin nuestras credenciales: al importarlo
          les pedirá las suyas.
        </p>

        {crms.length > 1 && (
          <>
            <label className="field-label" style={{ marginTop: "0.75rem" }}>
              CRM
            </label>
            <div className="chip-row">
              {crms.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${crm === c.id ? " active" : ""}`}
                  onClick={() => onCrmChange(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}

        {loading && (
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Preparando el flujo…
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
        {json && (
          <div style={{ marginTop: 10 }}>
            <button className="n8n-history-toggle" onClick={() => setOpenJson((v) => !v)}>
              {openJson ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
              <IconFileCode size={14} />
              <span>Ver JSON del flujo</span>
            </button>
            {openJson && <pre className="handoff-code">{json}</pre>}
          </div>
        )}
      </div>

      <div className="n8n-card">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <p className="section-label" style={{ margin: 0 }}>
            Tabla de historial
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={<IconCopy size={13} />}
            onClick={() => sql && copy("sql", sql)}
            disabled={!sql}
          >
            {copied === "sql" ? "Copiado" : "Copiar SQL"}
          </Button>
        </div>

        {sql ? (
          <>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Sus conversaciones se guardan en el Postgres del cliente. Este SQL crea el esquema
              &laquo;{schema}&raquo; con su tabla chats, sin los permisos a n8n_writer ni
              metabase_app, que solo existen en el nuestro.
            </p>
            <div style={{ marginTop: 10 }}>
              <button className="n8n-history-toggle" onClick={() => setOpenSql((v) => !v)}>
                {openSql ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                <IconDatabase size={14} />
                <span>Ver SQL</span>
              </button>
              {openSql && <pre className="handoff-code">{sql}</pre>}
            </div>
          </>
        ) : (
          <p className="field-hint" style={{ marginTop: 0 }}>
            Ese nombre no produce un nombre de esquema válido: necesita al menos una letra o un
            número.
          </p>
        )}
      </div>
    </>
  );
}

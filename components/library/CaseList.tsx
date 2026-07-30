"use client";

import { useCallback, useEffect, useState } from "react";
import { IconChevronDown, IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { parseTurnBubbles } from "@/lib/adversarial-message";
import type { ConversationTurn } from "@/lib/conversation-turns";

/** The case as the list endpoint returns it: no snapshots. */
type CaseRow = {
  id: string;
  id_de_kommo: string | null;
  conversation_at: string | null;
  turno_index: number | null;
  nota: string;
  resolved_version_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

type ReplayResult = {
  versionId: string;
  versionNumber: string;
  isProduction: boolean;
  original: ConversationTurn[];
  replayed: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** One reply, whether it comes from the snapshot (already split into turns) or
 *  from the model (a raw envelope), rendered as the bubbles it would be. */
function Reply({ bubbles, estado }: { bubbles: string[]; estado: string | null }) {
  return (
    <div>
      {bubbles.length === 0 ? (
        <div className="chat-msg">
          <div className="chat-content chat-empty">(Sin mensaje.)</div>
        </div>
      ) : (
        bubbles.map((b, i) => (
          <div key={i} className="chat-msg">
            <div className="chat-content">{b}</div>
            {estado && i === bubbles.length - 1 && (
              <div className="chat-state">
                <span className="chat-state-label">Estado</span>
                <span className="chat-state-value">{estado}</span>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function CaseItem({ kase }: { kase: CaseRow }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ version_id: string | null; at: string | null }>({
    version_id: kase.resolved_version_id,
    at: kase.resolved_at,
  });
  const [saving, setSaving] = useState(false);

  /** The verdict is a person's call after reading both replies. Passing null
   *  reopens the case, which is what a later version breaking it looks like. */
  async function resolve(versionId: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${kase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedVersionId: versionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el veredicto.");
      setResolved({ version_id: data.resolved_version_id, at: data.resolved_at });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el veredicto.");
    } finally {
      setSaving(false);
    }
  }

  async function runReplay() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${kase.id}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo correr el replay.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al correr el replay.");
    } finally {
      setRunning(false);
    }
  }

  const replayed = result ? parseTurnBubbles(result.replayed) : null;

  return (
    <div className="case-item">
      <div className="row-between">
        <span style={{ fontSize: 13 }}>
          {kase.id_de_kommo ? `Lead ${kase.id_de_kommo}` : "Conversación"}
          {resolved.at && <Badge variant="new">Ya pasa</Badge>}
        </span>
        <span className="muted" style={{ fontSize: 11 }}>
          {formatDate(kase.created_at)}
        </span>
      </div>
      <p style={{ fontSize: 12, margin: "4px 0" }}>{kase.nota}</p>

      <div className="row-between">
        <span className="muted" style={{ fontSize: 11 }}>
          {kase.turno_index == null ? "Sin turno marcado" : `Turno ${kase.turno_index + 1}`}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={runReplay}
          disabled={running || kase.turno_index == null}
        >
          <IconPlayerPlay size={13} />
          {running ? "Corriendo…" : "Correr replay"}
        </Button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {result && replayed && (
        <div className="replay-compare">
          <div>
            <span className="chat-turn-role">Lo que contestó en producción</span>
            <Reply
              bubbles={result.original.map((t) => t.texto)}
              estado={result.original.find((t) => t.estado)?.estado ?? null}
            />
          </div>
          <div>
            <span className="chat-turn-role">
              Con {result.versionNumber}
              {result.isProduction ? " (producción)" : ""}
            </span>
            {replayed.malformed ? (
              <div className="chat-msg chat-msg-error">
                <div className="chat-content chat-empty">
                  La respuesta no vino en el formato esperado.
                </div>
              </div>
            ) : (
              <Reply bubbles={replayed.messages} estado={replayed.state} />
            )}
          </div>

          <div className="row-between" style={{ gridColumn: "1 / -1" }}>
            <span className="muted" style={{ fontSize: 11 }}>
              ¿La nueva respuesta resuelve el problema?
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resolve(null)}
                disabled={saving}
              >
                Sigue fallando
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => resolve(result.versionId)}
                disabled={saving}
              >
                Ya pasa
              </Button>
            </span>
          </div>
        </div>
      )}

      {resolved.at && (
        <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Marcado como resuelto el {formatDate(resolved.at)}.
        </p>
      )}
    </div>
  );
}

/**
 * The cases filed for a client, and the replay for each one.
 *
 * A replay answers the tagged turn again with a candidate prompt and puts the
 * two replies side by side. It deliberately stops there: no automatic verdict,
 * because for a handful of cases a person reading both is better than a judge
 * that can be wrong in a way nobody notices.
 */
export function CaseList({
  clientId,
  embedded = false,
}: {
  clientId: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/cases`);
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudieron cargar los casos.");
      const data = await res.json();
      setCases(data.cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, [clientId]);

  useEffect(() => {
    if (open && cases === null && !error) load();
  }, [open, cases, error, load]);

  return (
    <div className={embedded ? "" : "n8n-card"}>
      {!embedded && (
        <button className="n8n-history-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <IconPlayerPlay size={14} />
          <span>Replay</span>
          {cases && cases.length > 0 && (
            <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
              {cases.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          {error && <p className="form-error">{error}</p>}
          {cases === null && !error && (
            <p className="muted" style={{ fontSize: 13 }}>Cargando…</p>
          )}
          {cases?.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Todavía no hay casos. Marca una conversación desde el historial.
            </p>
          )}
          {cases && cases.length > 0 && (
            <p className="muted" style={{ fontSize: 11 }}>
              {cases.filter((c) => c.resolved_at).length} de {cases.length} resueltos.
            </p>
          )}
          {cases?.map((kase) => <CaseItem key={kase.id} kase={kase} />)}
        </div>
      )}
    </div>
  );
}

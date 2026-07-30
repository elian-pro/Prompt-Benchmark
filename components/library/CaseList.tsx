"use client";

import { useCallback, useEffect, useState } from "react";
import { IconChevronDown, IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { parseTurnBubbles } from "@/lib/adversarial-message";
import type { ConversationTurn } from "@/lib/conversation-turns";

/** The case as the list endpoint returns it: no snapshots. */
type CaseRow = {
  id: string;
  id_de_kommo: string | null;
  conversation_at: string | null;
  turno_index: number | null;
  nota: string;
  created_at: string;
};

type ReplayResult = {
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
        </div>
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
export function CaseList({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
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
    <div className="n8n-card">
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
          {cases?.map((kase) => <CaseItem key={kase.id} kase={kase} />)}
        </div>
      )}
    </div>
  );
}

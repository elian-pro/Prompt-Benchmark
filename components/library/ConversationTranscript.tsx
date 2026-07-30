"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationRow } from "@/lib/db/chats-history";
import { transcriptOf, type ConversationTurn } from "@/lib/conversation-turns";
import { Button } from "@/components/ui/Button";

const ROLE_LABEL: Record<ConversationTurn["rol"], string> = {
  lead: "Lead",
  bot: "Bot del cliente",
  sistema: "Sistema",
};

/** Reuses the Playground's chat classes so a real conversation and a simulated
 *  one read the same way, selection included. */
function Turn({
  turn,
  selected,
  onSelect,
}: {
  turn: ConversationTurn;
  selected: boolean;
  onSelect: () => void;
}) {
  const side = turn.rol === "lead" ? "turn-lead" : "turn-bot";

  if (turn.rol === "sistema") {
    return (
      <div className="chat-turn turn-bot">
        <span className="chat-turn-role">{ROLE_LABEL.sistema}</span>
        <div className="chat-msg">
          <div className="chat-content chat-empty">
            El bot pasó a estado «{turn.estado}».
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-turn ${side}${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="chat-turn-role">{ROLE_LABEL[turn.rol]}</span>
      <div className="chat-msg">
        <div className="chat-content">{turn.texto}</div>
        {turn.estado && (
          <div className="chat-state">
            <span className="chat-state-label">Estado</span>
            <span className="chat-state-value">{turn.estado}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A real conversation rendered as a chat instead of a text blob.
 *
 * Rows written before the flows filled `turnos` are reconstructed from the
 * flat `historial`, and say so: that parser is best effort over a format whose
 * markers land mid-line and differ per client, so it will be wrong on exactly
 * the strangest conversations, which are the ones worth reading. The raw text
 * stays one click away for that reason, always, not only on failure.
 */
export function ConversationTranscript({
  row,
  clientId,
}: {
  row: ConversationRow;
  clientId: string;
}) {
  const router = useRouter();
  const [showRaw, setShowRaw] = useState(false);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { turns, source } = transcriptOf(row);

  /** Files the case and lands in the Editor with the message composed. The
   *  draft rides through sessionStorage under the key the Editor already
   *  watches, the same channel the Playground handoff uses. */
  async function sendToEditor() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId: row.id, nota: nota.trim(), turnoIndex: failedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar al Editor.");
      window.sessionStorage.setItem(
        `playground-handoff:${data.editorSessionId}`,
        data.draftMessage,
      );
      router.push(`/editor/${data.editorSessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar al Editor.");
      setSending(false);
    }
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 8 }}>
        {source === "historial" ? (
          <span className="muted" style={{ fontSize: 11 }}>
            Reconstruido del texto plano: puede tener errores.
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="version-changes-link"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Ver como chat" : "Ver texto crudo"}
        </button>
      </div>

      {showRaw ? (
        <pre className="version-view-content">
          {row.historial?.trim() ? row.historial : "(Sin contenido.)"}
        </pre>
      ) : turns.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No se pudo leer ningún mensaje. Revisa el texto crudo.
        </p>
      ) : (
        <>
          <div className="chat-transcript">
            {turns.map((turn, i) => (
              <Turn
                key={i}
                turn={turn}
                selected={failedAt === i}
                onSelect={() => setFailedAt((current) => (current === i ? null : i))}
              />
            ))}
          </div>

          <div className="case-compose">
            <p className="muted" style={{ fontSize: 11 }}>
              {failedAt === null
                ? "Haz clic en el mensaje donde el bot falló, para poder correr el replay después."
                : `Mensaje ${failedAt + 1} marcado como el punto de falla.`}
            </p>
            <textarea
              className="textarea"
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="¿Qué salió mal? Ej. dio el precio antes de perfilar."
            />
            {error && <p className="form-error">{error}</p>}
            <div className="row-between">
              <span className="muted" style={{ fontSize: 11 }}>
                Se guarda como caso de este cliente.
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={sendToEditor}
                disabled={sending || !nota.trim()}
              >
                {sending ? "Enviando…" : "Enviar al Editor"}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

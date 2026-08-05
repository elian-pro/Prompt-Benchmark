"use client";

import { useState } from "react";
import type { ConversationRow } from "@/lib/db/chats-history";
import { transcriptOf } from "@/lib/conversation-turns";
import { Turn } from "@/components/conversation/Turn";

/**
 * A real conversation, read only. Marking messages and filing a case is
 * Replay's job (components/replay/ReplayWorkspace.tsx); this is the reference
 * view that lives in the Library.
 *
 * Rows written before the flows filled `turnos` are reconstructed from the
 * flat `historial`, and say so: that parser is best effort over a format whose
 * markers land mid-line and differ per client, so it will be wrong on exactly
 * the strangest conversations, which are the ones worth reading. The raw text
 * stays one click away for that reason, always, not only on failure.
 */
export function ConversationTranscript({ row }: { row: ConversationRow }) {
  const [showRaw, setShowRaw] = useState(false);
  const { turns, source } = transcriptOf(row);

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
        <div className="chat-messages">
          {turns.map((turn, i) => (
            <Turn key={i} turn={turn} />
          ))}
        </div>
      )}
    </>
  );
}

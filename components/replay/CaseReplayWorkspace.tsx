"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconPlayerPlay, IconRefresh, IconSend } from "@tabler/icons-react";

import type { ConversationTurn } from "@/lib/conversation-turns";
import { parseTurnBubbles } from "@/lib/adversarial-message";
import { Turn } from "@/components/conversation/Turn";
import { Button } from "@/components/ui/Button";

/** A version as the selector needs it. */
type Version = {
  id: string;
  version_number: string;
  is_production: boolean;
};

/** One turn of the replay's own conversation. A bot turn keeps the raw
 *  envelope the model emitted: that is what travels back as history, and the
 *  bubbles are parsed out of it only to draw them. */
type ReplayTurn = { role: "lead" | "bot"; content: string };

/** The replay's turns as the API takes them. */
function asContinuation(thread: ReplayTurn[]) {
  return thread.map((t) => ({
    role: t.role === "lead" ? ("user" as const) : ("assistant" as const),
    content: t.content,
  }));
}

/** A finished replay turn, drawn with the same component as the real
 *  conversation so both columns read as the same kind of thing. */
function replayTurns(turn: ReplayTurn): ConversationTurn[] {
  if (turn.role === "lead") return [{ rol: "lead", texto: turn.content }];
  const parsed = parseTurnBubbles(turn.content);
  if (parsed.malformed) {
    return [{ rol: "bot", texto: "(La respuesta no vino en el formato esperado.)" }];
  }
  const messages = parsed.messages.length > 0 ? parsed.messages : ["(Sin mensaje.)"];
  return messages.map((texto, i) => ({
    rol: "bot" as const,
    texto,
    estado: i === messages.length - 1 ? parsed.state : null,
  }));
}

/**
 * One case, side by side: the real conversation on the left, the replay on the
 * right.
 *
 * The replay starts where the bot got it wrong. The candidate version answers
 * that same lead message, and from there the conversation can be continued by
 * hand: a fixed prompt that answers one turn well and derails on the next has
 * not fixed anything, and one reply cannot show that.
 *
 * Nothing about the replay is stored. It lives in this component and travels
 * back to the server on each turn, which is why leaving the page loses it: it
 * is an experiment, not a record. The case, its note and its verdict are the
 * record.
 */
export function CaseReplayWorkspace({
  caseId,
  clientId,
  turns,
  source,
  markedTurns,
  replayable,
  resolvedVersionId,
  resolvedAt,
}: {
  caseId: string;
  clientId: string;
  turns: ConversationTurn[];
  source: "turnos" | "historial";
  markedTurns: number[];
  /** False when the note marks nothing or only lead messages: there is no bot
   *  reply to run again. */
  replayable: boolean;
  resolvedVersionId: string | null;
  resolvedAt: string | null;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState<string>("");
  const [thread, setThread] = useState<ReplayTurn[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState({ id: resolvedVersionId, at: resolvedAt });
  const [saving, setSaving] = useState(false);

  const markedRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/versions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Version[]) => {
        setVersions(list);
        // Production is the version the question is usually about: did what I
        // promoted fix this?
        setVersionId(list.find((v) => v.is_production)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => setError("No se pudieron cargar las versiones."));
  }, [clientId]);

  // The failing turn is the reason the page was opened, and it is usually deep
  // in the conversation. Everything above it stays one scroll away.
  useEffect(() => {
    markedRef.current?.scrollIntoView({ block: "center" });
  }, [turns]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread, streaming]);

  const running = streaming !== null;

  /** Runs one turn of the replay: sends the case, the chosen version and the
   *  replay's conversation so far, then reads the reply as it is written. */
  const run = useCallback(
    async (continuation: ReplayTurn[]) => {
      setStreaming("");
      setError(null);
      try {
        const res = await fetch(`/api/cases/${caseId}/replay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId: versionId || undefined,
            continuation: asContinuation(continuation),
          }),
        });
        // Everything that fails before the model runs is still plain JSON.
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo correr el replay.");
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let buffer = "";
        let failure: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // The tail is whatever came after the last newline: half an event.
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line);
            if (evt.type === "text") {
              acc += evt.text;
              setStreaming(acc);
            } else if (evt.type === "error") failure = evt.message;
          }
        }
        if (failure) setError(failure);
        if (acc) setThread([...continuation, { role: "bot", content: acc }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al correr el replay.");
      } finally {
        setStreaming(null);
      }
    },
    [caseId, versionId],
  );

  function send() {
    const text = draft.trim();
    if (!text || running) return;
    setDraft("");
    void run([...thread, { role: "lead", content: text }]);
  }

  /** The verdict is a person's call after reading the replay. Passing null
   *  reopens the case, which is what a later version breaking it looks like. */
  async function resolve(id: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedVersionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el veredicto.");
      setResolved({ id: data.resolved_version_id, at: data.resolved_at });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el veredicto.");
    } finally {
      setSaving(false);
    }
  }

  const started = thread.length > 0 || running;

  return (
    <div className="case-replay-layout">
      <section className="case-replay-column">
        <div className="row-between case-replay-head">
          <span className="section-label" style={{ margin: 0 }}>
            Lo que pasó en producción
          </span>
          {source === "historial" && (
            <span className="muted" style={{ fontSize: 11 }}>
              Reconstruido del texto plano: puede tener errores.
            </span>
          )}
        </div>
        <div className="chat-messages case-replay-scroll">
          {turns.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No se pudo leer ningún mensaje de esta conversación.
            </p>
          ) : (
            turns.map((turn, i) => (
              // The anchor is the earliest marked turn: a note can mark
              // several, and they do not arrive in order.
              <div key={i} ref={i === Math.min(...markedTurns) ? markedRef : undefined}>
                <Turn turn={turn} pins={markedTurns.includes(i) ? [1] : []} />
              </div>
            ))
          )}
        </div>
      </section>

      <section className="case-replay-column">
        <div className="row-between case-replay-head">
          <span className="section-label" style={{ margin: 0 }}>
            Replay
          </span>
          <select
            className="select"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            disabled={running || started}
            aria-label="Versión contra la que corre el replay"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version_number}
                {v.is_production ? " (producción)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="chat-messages case-replay-scroll">
          {!started && (
            <p className="empty-hint">
              {replayable
                ? "Corre el replay y la versión elegida contesta desde el mensaje marcado. Desde ahí puedes seguir la conversación tú, escribiendo como el lead."
                : "Esta nota no marca ningún mensaje, así que no hay un punto donde volver a contestar. Marca uno en la conversación y vuelve."}
            </p>
          )}
          {thread.map((turn, i) =>
            replayTurns(turn).map((t, j) => <Turn key={`${i}-${j}`} turn={t} />),
          )}
          {streaming !== null && (
            <div className="chat-turn turn-bot is-static">
              <span className="chat-turn-role">Bot del cliente</span>
              <div className="chat-msg">
                {/* Mid stream the text is a half-written envelope, so it is
                    shown raw. It becomes bubbles the moment it parses. */}
                <div className="chat-content">
                  {streaming}
                  <span className="chat-caret" />
                </div>
              </div>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {error && <p className="form-error">{error}</p>}

        {!started ? (
          <Button
            variant="secondary"
            onClick={() => run([])}
            disabled={!replayable || running || !versionId}
            icon={<IconPlayerPlay size={14} />}
          >
            Correr replay
          </Button>
        ) : (
          <>
            <div className="case-replay-composer">
              <textarea
                className="textarea"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Sigue la conversación como el lead…"
                disabled={running}
              />
              <Button
                variant="primary"
                onClick={send}
                disabled={running || draft.trim().length === 0}
                icon={<IconSend size={14} />}
              >
                Enviar
              </Button>
            </div>

            <div className="row-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setThread([]);
                  setError(null);
                }}
                disabled={running}
                icon={<IconRefresh size={13} />}
              >
                Empezar de nuevo
              </Button>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  ¿Ya quedó?
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resolve(null)}
                  disabled={saving || running}
                >
                  Sigue fallando
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => resolve(versionId)}
                  disabled={saving || running}
                >
                  Ya pasa
                </Button>
              </span>
            </div>
          </>
        )}

        {resolved.at && (
          <p className="muted" style={{ fontSize: 11 }}>
            Marcado como resuelto el{" "}
            {new Date(resolved.at).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            {resolved.id && versions.find((v) => v.id === resolved.id)
              ? ` con ${versions.find((v) => v.id === resolved.id)!.version_number}`
              : ""}
            .
          </p>
        )}
      </section>
    </div>
  );
}

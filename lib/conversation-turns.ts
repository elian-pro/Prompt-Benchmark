/**
 * Turning a stored conversation into something renderable as a chat.
 *
 * Two sources, and which one a row has depends on when it was written:
 *
 * - `turnos`: one object per turn, written by the n8n flows since 2026-07-30.
 *   Exact, with the estado on each bot turn.
 * - `historial`: a flat blob the flows build by appending "User:..." / "IA:..."
 *   fragments across five separate Supabase nodes. The markers land mid-line,
 *   they differ per client ("User: " here, "User:" there), and a lead who
 *   writes "IA:" in their own message corrupts it. Parsed best-effort and
 *   shown as reconstructed, never presented as exact.
 *
 * Pure module (no DB, no React) so the parsing can be unit-tested directly.
 */

import { ESTADOS } from "./estados.ts";

export type TurnRole = "lead" | "bot" | "sistema";

export type ConversationTurn = {
  rol: TurnRole;
  texto: string;
  estado?: string | null;
  ts?: string | null;
};

/** Splits on the role markers wherever they appear, not only at line starts,
 *  because that is where the flows actually put them. The `se mueve a` form is
 *  how a state transition was recorded before `turnos` existed. */
const MARKER = /(User:\s?|IA:\s?|\n?se mueve a )/;

const ROLE_BY_MARKER: Record<string, TurnRole> = {
  "user:": "lead",
  "ia:": "bot",
  "se mueve a": "sistema",
};

/**
 * Estados that some flows wrote as if they were a bot message (the
 * `|| $('Edit Fields7').item.json.estado` fallback in the n8n expression),
 * producing a bubble that reads "IA:activo" in the middle of a conversation.
 *
 * Recognized conservatively: a hyphenated token cannot be a real message, and
 * the unhyphenated ones here are not plausible as a whole bot message either.
 * Anything else stays a message. Being wrong here hides real text, so the rule
 * errs toward keeping it.
 */
const BARE_ESTADOS = new Set<string>([
  ...ESTADOS,
  // Not canonical, but real flows already wrote them into `historial`. Dropping
  // them would break the parsing of conversations already stored.
  "activo",
  "agendado",
]);

function looksLikeEstado(text: string): boolean {
  if (!/^[a-z][a-z0-9-]*$/.test(text)) return false;
  return text.includes("-") || BARE_ESTADOS.has(text);
}

function markerRole(marker: string): TurnRole {
  return ROLE_BY_MARKER[marker.trim().toLowerCase()];
}

/**
 * Best-effort reconstruction of the turns in a legacy `historial` blob.
 * Empty segments are dropped: the flows routinely emit "User:IA: ..." with
 * nothing between the two markers.
 */
export function parseHistorial(historial: string): ConversationTurn[] {
  const parts = historial.split(MARKER);
  const turns: ConversationTurn[] = [];
  /** An estado seen in a bot slot, waiting for the message it describes. The
   *  flow writes "IA:<estado>" from one node and the actual messages from the
   *  loop node right after, so the estado arrives BEFORE its own bubbles. */
  let pendingEstado: string | null = null;

  // parts[0] is whatever came before the first marker (usually empty).
  for (let i = 1; i < parts.length; i += 2) {
    const rol = markerRole(parts[i]);
    const texto = (parts[i + 1] ?? "").trim();
    if (!rol) continue;

    if (rol === "sistema") {
      if (texto) turns.push({ rol, texto: "", estado: texto });
      continue;
    }
    if (!texto) continue;

    if (rol === "bot" && looksLikeEstado(texto)) {
      pendingEstado = texto;
      continue;
    }

    const turn: ConversationTurn = { rol, texto };
    if (rol === "bot" && pendingEstado) {
      turn.estado = pendingEstado;
      pendingEstado = null;
    }
    turns.push(turn);
  }

  // An estado with no bot message after it describes the last one there was.
  if (pendingEstado) {
    const lastBot = [...turns].reverse().find((t) => t.rol === "bot");
    if (lastBot) lastBot.estado = pendingEstado;
  }

  return turns;
}

/** Loose shape check: `turnos` is written by n8n expressions, not by us. */
function isTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (t.rol === "lead" || t.rol === "bot" || t.rol === "sistema");
}

export type Transcript = {
  turns: ConversationTurn[];
  /** "turnos" is what the bot actually emitted; "historial" was reconstructed
   *  by the parser and must be labeled as such in the UI. */
  source: "turnos" | "historial";
};

/**
 * The turns to render for one conversation row, preferring the structured
 * column. A `turnos` array that is present but empty still counts as exact:
 * an empty conversation is a fact, not a parsing failure.
 */
export function transcriptOf(row: {
  turnos?: unknown;
  historial?: string | null;
}): Transcript {
  if (Array.isArray(row.turnos)) {
    return { turns: row.turnos.filter(isTurn), source: "turnos" };
  }
  return { turns: parseHistorial(row.historial ?? ""), source: "historial" };
}

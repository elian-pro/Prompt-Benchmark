/**
 * Shared helpers for reading a bot-under-test turn in the Adversarial Lab.
 *
 * Bots often reply with a structured JSON envelope (e.g.
 * {"estado": "...", "mensajes": [...]}). These pull the human-readable message
 * out of that envelope so the transcript reads as a conversation and the
 * adversarial lead responds to real text — while the raw JSON can still be
 * shown as a secondary "estado" note. Used by both the run engine (server) and
 * the run detail page (client), so keep it dependency-free.
 */

const MESSAGE_KEYS = [
  "mensajes",
  "messages",
  "mensaje",
  "message",
  "respuesta",
  "reply",
  "texto",
  "text",
  "content",
];

/** Best-effort extraction of readable text from a parsed JSON value. */
export function extractMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map(extractMessage)
      .filter((s) => s.trim())
      .join("\n\n");
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of MESSAGE_KEYS) {
      if (key in obj && obj[key] != null) {
        const s = extractMessage(obj[key]);
        if (s.trim()) return s.trim();
      }
    }
  }
  return "";
}

const STATE_KEYS = ["estado", "state", "status"];

/** The lead/conversation state value (e.g. "por-perfilar"), if present. */
export function extractState(value: unknown): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of STATE_KEYS) {
      if (key in obj && obj[key] != null) {
        const v = obj[key];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number" || typeof v === "boolean") return String(v);
      }
    }
  }
  return null;
}

/**
 * Splits a turn's content into the readable message and, when the content was a
 * JSON envelope, just the `estado` value (not the whole JSON — the messages are
 * already the bubble text). Non-JSON content is returned as-is with no state.
 */
export function parseTurn(content: string): { message: string; state: string | null } {
  const trimmed = content.trim();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    return { message: content, state: null };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return { message: extractMessage(parsed), state: extractState(parsed) };
  } catch {
    // Not valid JSON (or still streaming) — show it as-is.
    return { message: content, state: null };
  }
}

// Matches a leading parenthetical paragraph — allowing one level of nested
// parens — followed by a blank line before more content. This is the shape of
// a stage direction some models emit despite instructions (e.g. "(espero la
// respuesta, escribo algo casual mientras tanto)\n\nDale, sin prisa..."), as
// opposed to a message that legitimately opens with "(algo) el resto...", which
// has no paragraph break and is left untouched.
const LEADING_STAGE_DIRECTION = /^\s*\((?:[^()]|\([^()]*\))*\)\s*\n\s*\n+/;

/**
 * Strips a leading stage-direction paragraph some models emit despite being
 * told to stay in character (narrating what they're "about to write" instead
 * of just writing it). Only applied to the adversarial lead's turns — that's
 * the role this leaked from. Falls back to the original text if stripping
 * would leave nothing (avoids ever showing an empty bubble).
 */
export function stripStageDirection(content: string): string {
  const match = content.match(LEADING_STAGE_DIRECTION);
  if (!match) return content;
  const rest = content.slice(match[0].length).trim();
  return rest || content;
}

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

/**
 * Splits a turn's content into the readable message and, when the content was a
 * JSON envelope, the pretty-printed raw JSON (`state`). Non-JSON content is
 * returned as-is with no state.
 */
export function parseTurn(content: string): { message: string; state: string | null } {
  const trimmed = content.trim();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    return { message: content, state: null };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return { message: extractMessage(parsed), state: JSON.stringify(parsed, null, 2) };
  } catch {
    // Not valid JSON (or still streaming) — show it as-is.
    return { message: content, state: null };
  }
}

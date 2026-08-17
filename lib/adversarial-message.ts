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
 * Strips a Markdown code fence some models wrap their JSON in despite being
 * told to reply with raw JSON, e.g. ```json\n{...}\n``` . Without this the
 * envelope never parses (it starts with a backtick, not `{`) and the raw
 * braces leak into the transcript. Tolerates a missing closing fence
 * (truncated / streaming output).
 */
export function stripCodeFence(content: string): string {
  let s = content.trim();
  if (/^```[^\n`]*\n/.test(s)) {
    s = s.replace(/^```[^\n`]*\n/, "").replace(/\n?```$/, "");
  }
  return s.trim();
}

/**
 * Splits a turn's content into the readable message and, when the content was a
 * JSON envelope, just the `estado` value (not the whole JSON — the messages are
 * already the bubble text). Non-JSON content is returned as-is with no state.
 */
export function parseTurn(content: string): { message: string; state: string | null } {
  const trimmed = stripCodeFence(content);
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

/**
 * Debug metadata a Playground turn carries when debug mode was on (see
 * DEBUG_RESPONSE_FORMAT in lib/demo-turn.ts). The fields live inside the same
 * stored JSON envelope; turns generated without debug simply lack them.
 */
export function parseDebug(
  content: string,
): { razonamiento: string; reglaAplicada: string } | null {
  try {
    const parsed: unknown = JSON.parse(stripCodeFence(content));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { razonamiento, regla_aplicada } = parsed as Record<string, unknown>;
    if (typeof razonamiento !== "string" || typeof regla_aplicada !== "string") return null;
    return { razonamiento, reglaAplicada: regla_aplicada };
  } catch {
    return null;
  }
}

/** Splits readable text into WhatsApp-style bubbles: one per line break (a
 *  single `\n` already means a separate WhatsApp message in production), empty
 *  segments dropped. */
function splitBubbles(text: string): string[] {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Like parseTurn, but returns the message as an ARRAY of bubbles instead of one
 * string, so the Playground can render a bot turn the way n8n delivers it to
 * WhatsApp: one bubble per line break / per `mensajes` array item. `state` is
 * the JSON envelope's estado, meant to hang off the last bubble.
 *
 * Crucially, line-break splitting is ONLY applied to genuine readable text
 * (plain prose, or the message extracted from a valid envelope). Content that
 * looks like JSON but fails to parse is NEVER split (that would explode raw
 * braces into one bubble per line). Such content is reported as `malformed` so
 * the caller can show a clean fallback instead of the raw envelope.
 * `messages` empty + not malformed = a valid envelope with only an estado.
 */
export function parseTurnBubbles(content: string): {
  messages: string[];
  state: string | null;
  malformed: boolean;
} {
  const stripped = stripCodeFence(content);
  const looksJson = stripped[0] === "{" || stripped[0] === "[";
  if (!looksJson) {
    return { messages: splitBubbles(stripped), state: null, malformed: false };
  }
  try {
    const parsed: unknown = JSON.parse(stripped);
    return {
      messages: splitBubbles(extractMessage(parsed)),
      state: extractState(parsed),
      malformed: false,
    };
  } catch {
    return { messages: [], state: null, malformed: true };
  }
}

/**
 * Re-wraps a plain-text bot turn in the JSON envelope the prompt asks for,
 * for the history sent BACK to the model (never for storage or display).
 *
 * The seeded opening message is written by a human, so it is plain text. Fed
 * to the model as its own first `assistant` turn, it reads as precedent that
 * plain text is the output format, and the bot drops the envelope for the rest
 * of the conversation (the format rule sits thousands of tokens away in a long
 * prompt, the example is right there). No `estado` is invented: only the shape
 * matters. Content that already looks like JSON, or a prompt with no envelope
 * spec, is left untouched.
 */
export function asEnvelope(content: string, systemPrompt: string): string {
  const trimmed = content.trim();
  if (!trimmed || trimmed[0] === "{" || trimmed[0] === "[") return content;
  const key = systemPrompt.match(/"(mensajes|messages)"\s*:/)?.[1];
  return key ? JSON.stringify({ [key]: [trimmed] }) : content;
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

/**
 * A one line quote of a message, for the note that tags it. Runs the envelope
 * through parseTurn first, so a note about a bot turn quotes what the lead
 * actually read, not the raw JSON.
 *
 * Shared by the Playground, the client's demo link and the admin's review of
 * it: three places that show "the message this note is about", and that must
 * agree on what that message says.
 */
export function messagePreview(content: string, max = 60): string {
  const { message } = parseTurn(content);
  const text = message.trim() || "(sin mensaje)";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

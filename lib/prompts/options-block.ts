/**
 * Selectable-options block: a structured questionnaire the assistant can emit
 * instead of asking clarification questions in plain text. The chat renders it
 * as tappable option buttons; the user's choice is inserted into the
 * conversation as a normal message.
 *
 * This module mirrors the prompt-block contract in `editor-persona.ts` so the
 * server and the chat renderer agree on exactly what "the block" is. The two
 * contracts are independent sentinel families and must stay separate: a prompt
 * block delimits a full prompt with text markers; an options block delimits a
 * JSON payload with its own markers.
 *
 * Everything degrades gracefully: if the JSON between the markers is malformed
 * or fails validation, the block resolves to null and the raw text just shows
 * in the chat, exactly like the prompt block's own fallback. The chat is never
 * broken by a bad emission.
 *
 * Written in Spanish where it faces the model/user, like its sibling personas.
 */
import { z } from "zod";

/** The output-contract delimiters. Text markers (not ``` backticks) so the JSON
 *  payload can never be confused with a markdown fence, and so this family never
 *  collides with the prompt block's ===PROMPT ACTUALIZADO=== markers. */
export const OPTIONS_START = "===OPCIONES===";
export const OPTIONS_END = "===FIN OPCIONES===";

export type QuestionType = "single_select" | "multi_select" | "rank";

/**
 * The model-facing contract for emitting a selectable-options block. Appended
 * to both the Editor and Creator system prompts (after the persona, so it
 * survives persona overrides). Spanish, no em dashes (CLAUDE.md rules 7 and 9).
 */
export const OPTIONS_CONTRACT = `BLOQUE DE OPCIONES SELECCIONABLES (recurso opcional):
Cuando necesites que el usuario elija entre alternativas para recopilar una preferencia, restricción o dato de contexto acotado (por ejemplo presupuesto, zona, tono, prioridad), puedes ofrecerle opciones tocables en lugar de pedirle que escriba. Para hacerlo, emite un bloque delimitado EXACTAMENTE con estas dos líneas, cada una en su propia línea, con un JSON válido en medio:
${OPTIONS_START}
{ "questions": [ { "id": "presupuesto", "prompt": "¿Cuál es tu presupuesto?", "type": "single_select", "options": ["Bajo", "Medio", "Alto"] } ] }
${OPTIONS_END}

Reglas del bloque:
- De 1 a 3 preguntas por bloque. Cada pregunta con 2 a 4 opciones de etiqueta corta (2 a 5 palabras).
- "type" es uno de: "single_select" (elegir una), "multi_select" (elegir una o varias), "rank" (ordenar por prioridad).
- "id" es un identificador corto y único por pregunta.
- Antes del bloque, escribe siempre una línea conversacional breve que lo introduzca. Nunca muestres el bloque en silencio.
- Úsalo SOLO para elicitar preferencias, restricciones o contexto. No lo uses para preguntas de análisis u opinión, ni cuando el usuario ya dio la información o la puedes inferir con seguridad.
- Si la duda es abierta y no se presta a opciones, pregunta en texto normal como siempre.
- No mezcles el bloque de opciones con la entrega de un prompt en la misma respuesta.`;

/** A single tolerant question. Counts are clamped rather than hard-rejected so a
 *  minor drift (5 options, 4 questions) still renders as a block instead of
 *  collapsing to raw text; a structurally-broken payload still fails to null. */
const questionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    type: z.enum(["single_select", "multi_select", "rank"]),
    options: z.array(z.string().min(1)).min(2).max(6),
  })
  .transform((q) => ({ ...q, options: q.options.slice(0, 4) }));

export const optionsBlockSchema = z.object({
  questions: z.array(questionSchema).min(1).max(3),
});

export type OptionsQuestion = z.infer<typeof questionSchema>;
export type OptionsBlock = z.infer<typeof optionsBlockSchema>;

/**
 * Parses the JSON payload between the markers, tolerating an accidental ```json
 * fence or surrounding prose by slicing from the first `{` to the last `}`.
 * Never throws; returns null when nothing JSON-like is present.
 * Mirrors `parseJudgeReply` in the adversarial run route.
 */
export function parseOptionsJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// Content between the two markers. Non-greedy is safe because OPTIONS_END never
// appears inside a real JSON payload.
const OPTIONS_RE = new RegExp(`${OPTIONS_START}[ \\t]*\\n([\\s\\S]*?)\\n?${OPTIONS_END}`);

type BlockLocation = { block: OptionsBlock; start: number; end: number };

/**
 * Locates and validates the options block in an assistant reply. Returns null
 * when there is no complete, valid block yet (still streaming, cut off, or the
 * JSON failed to parse/validate) so the caller falls back to plain text.
 */
function locateOptionsBlock(reply: string): BlockLocation | null {
  const match = reply.match(OPTIONS_RE);
  if (!match || match.index === undefined) return null;
  const parsed = parseOptionsJson(match[1]);
  if (parsed === null) return null;
  const result = optionsBlockSchema.safeParse(parsed);
  if (!result.success) return null;
  return { block: result.data, start: match.index, end: match.index + match[0].length };
}

/**
 * Splits a reply around its options block into the prose before it, the parsed
 * block (null when there is no complete valid block), and the prose after it.
 * Shared by the server and the chat renderer so both agree on the boundaries.
 */
export function splitOptionsBlock(reply: string): {
  before: string;
  block: OptionsBlock | null;
  after: string;
} {
  const loc = locateOptionsBlock(reply);
  if (!loc) return { before: reply, block: null, after: "" };
  return { before: reply.slice(0, loc.start), block: loc.block, after: reply.slice(loc.end) };
}

/**
 * Whether the reply opened an options block that never closed: while it streams,
 * the START marker is present but END has not arrived. Used to show a
 * "preparando opciones…" placeholder instead of the half-written JSON.
 */
export function hasUnclosedOptionsBlock(reply: string): boolean {
  return reply.includes(OPTIONS_START) && !reply.includes(OPTIONS_END);
}

/**
 * The chat-visible prose that precedes an unclosed options block. While the
 * block streams, `splitOptionsBlock` can't locate it yet and falls back to
 * `before: reply`, which would dump the partial JSON as raw chat text. This
 * returns only the prose before the opening marker so the renderer hides the
 * rest and shows just the placeholder card.
 */
export function optionsBlockPreamble(reply: string): string {
  const i = reply.indexOf(OPTIONS_START);
  return i === -1 ? reply : reply.slice(0, i);
}

/** A user's selection for one question. `value` is a single string for
 *  single_select, an array for multi_select (any order) and rank (by priority). */
export type QuestionSelection = {
  questionId: string;
  type: QuestionType;
  value: string | string[];
};

/**
 * Builds the human-readable message that gets sent as the user's turn, e.g.
 * "Presupuesto: Medio · Zona: Norte". Rank is rendered as an ordered list,
 * multi as a comma-join. Always returns a non-empty string (the send endpoint
 * requires content of length >= 1); falls back to a dash when a selection is
 * somehow empty.
 */
export function buildAnswerSummary(block: OptionsBlock, selections: QuestionSelection[]): string {
  const byId = new Map(selections.map((s) => [s.questionId, s]));
  const parts: string[] = [];
  for (const q of block.questions) {
    const sel = byId.get(q.id);
    const label = shortLabel(q.prompt);
    if (!sel) continue;
    if (q.type === "rank" && Array.isArray(sel.value)) {
      const ordered = sel.value.map((opt, i) => `${i + 1}) ${opt}`).join(", ");
      parts.push(`${label}: ${ordered}`);
    } else if (Array.isArray(sel.value)) {
      parts.push(`${label}: ${sel.value.join(", ")}`);
    } else {
      parts.push(`${label}: ${sel.value}`);
    }
  }
  const summary = parts.filter((p) => p.trim().length > 0).join(" · ");
  return summary.trim().length > 0 ? summary : "-";
}

/** Trims a question prompt down to a compact label for the one-line summary:
 *  drops a trailing "?" and any leading interrogative so "¿Cuál es tu
 *  presupuesto?" becomes "Presupuesto". Best-effort; falls back to the prompt. */
function shortLabel(prompt: string): string {
  const cleaned = prompt.trim().replace(/^[¿?]+/, "").replace(/[?¿]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : prompt.trim();
}

/**
 * Moves the item at `index` one step in `dir` (-1 up, +1 down), returning a new
 * array. Out-of-range moves return the array unchanged. Implemented with a
 * spread copy and an index swap, deliberately NOT Array.prototype.with /
 * toSpliced, which are Node 20+ globals (production runs Node 18).
 */
export function moveRankItem(order: string[], index: number, dir: -1 | 1): string[] {
  const target = index + dir;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return order;
  }
  const next = [...order];
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return next;
}

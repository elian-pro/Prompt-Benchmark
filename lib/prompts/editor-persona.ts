/**
 * System prompt for the Editor's "ingeniero-de-prompts" persona.
 *
 * Ported from the team's manual "Ajustes de Prompts Conversacionales" template,
 * with two deliberate changes locked at Sprint 2 planning (see docs/SPRINT-2.md):
 *
 *  1. The ROL is generalized beyond real estate to multi-vertical
 *     lead-qualification agents (inmobiliario, restaurantero, wellness, …), so
 *     edits to non-real-estate clients aren't contaminated.
 *  2. The persona does NOT bump version numbers — the Studio owns versioning via
 *     createVersion (minor bump on "Finalizar edición"). The original template's
 *     "actualiza la versión" step is intentionally dropped.
 *
 * Output contract (also locked at planning): the assistant returns the full
 * updated prompt inside a single fenced code block, followed by a
 * `CAMBIOS REALIZADOS / SIN CAMBIOS` summary outside the block. The streaming
 * endpoint (S2-T4) parses the fenced block into `current_draft_content`.
 *
 * The prompt is written in Spanish: it operates on the team's Spanish prompts
 * and reasons in the same language they edit in.
 */

/** The persona's standing instructions, independent of any specific prompt.
 *  Exported so Settings can display it (read-only workspace; the runtime
 *  always uses this constant). */
export const EDITOR_PERSONA = `Eres un ingeniero de prompts especializado en agentes conversacionales de perfilamiento de leads para una agencia de mercadotecnia. Trabajas con clientes de distintos giros (inmobiliario, restaurantero, wellness, y otros); nunca asumas que un cliente es inmobiliario salvo que el propio prompt lo indique.

Trabajas con prompts que ya están en producción y cuya información fue verificada por el cliente. Tu responsabilidad es hacer cambios QUIRÚRGICOS: tocar únicamente lo que el usuario te pide, sin alterar estructura, tono, formato, flujo de perfilamiento ni ningún contenido que no esté explícitamente en el alcance del cambio solicitado.

Reglas de edición:
- No reformules, no "mejores" y no toques nada fuera del alcance indicado.
- Conserva idéntico todo lo demás: redacción, orden de secciones, ejemplos, formato y espaciado.
- Si la instrucción del usuario es ambigua o te faltan datos para aplicarla con seguridad, pregunta antes de editar en vez de inventar.
- Nunca cambies números de versión ni agregues etiquetas de versión: el sistema gestiona el versionado por separado.

El usuario describirá el cambio en lenguaje natural. Internamente, clasifícalo en uno de estos tipos para aplicarlo con precisión:
- Corrección por conversación real: el agente respondió algo que el cliente no aprobó.
- Actualización de base de conocimiento: cambió un dato del proyecto (precios, fechas, condiciones, etc.).
- Nueva regla o comportamiento: se agrega una objeción, escenario, flujo o restricción.
- Eliminación: se debe remover contenido del prompt.

FORMATO DE ENTREGA (obligatorio en cada respuesta que modifique el prompt):
1. Entrega el prompt COMPLETO ya con los cambios integrados, delimitado EXACTAMENTE con estas dos líneas, cada una en su propia línea:
===PROMPT ACTUALIZADO===
(aquí va el prompt completo, listo para copiar y pegar)
===FIN DEL PROMPT===
No envuelvas el prompt en un bloque de código markdown (triple backtick). El prompt puede CONTENER bloques \`\`\` internos (por ejemplo ejemplos de salida en JSON); por eso los delimitadores son de texto y no backticks. Todo lo que esté entre esas dos líneas se guarda como el prompt, tal cual.
2. Después de la línea ===FIN DEL PROMPT===, incluye este resumen:

**CAMBIOS REALIZADOS:**
- Sección modificada: [nombre]
- Tipo de cambio: [qué se hizo en una línea]
- Líneas/elementos afectados: [descripción breve]

**SIN CAMBIOS:**
- Todo lo demás del prompt permanece idéntico.

Si el usuario solo hace una pregunta o pide una aclaración sin solicitar una edición, responde con texto normal y NO incluyas los delimitadores ni el resumen.`;

/**
 * Builds the full system prompt by appending the prompt currently under edit.
 * `currentDraft` is the session's working draft (seeded from the base version).
 * `personaOverride`, when given, replaces the code persona with the team's
 * saved version from Settings (prompt_overrides); the dynamic draft is still
 * appended here either way.
 */
export function buildEditorSystemPrompt(
  currentDraft: string,
  personaOverride?: string | null,
): string {
  const draft = currentDraft.trim().length > 0 ? currentDraft : "(El prompt está vacío.)";
  const persona = personaOverride?.trim() ? personaOverride : EDITOR_PERSONA;
  return `${persona}

---

PROMPT EN PRODUCCIÓN (estado actual sobre el que debes trabajar):

${draft}`;
}

// The output contract's delimiters. Text markers (not ``` backticks) so a
// prompt that itself contains ```json blocks can never break extraction.
export const PROMPT_START = "===PROMPT ACTUALIZADO===";
export const PROMPT_END = "===FIN DEL PROMPT===";

// Sentinel block: content between the two markers. Non-greedy is safe because
// PROMPT_END never appears inside a real prompt.
const SENTINEL_RE = new RegExp(`${PROMPT_START}[ \\t]*\\n([\\s\\S]*?)\\n?${PROMPT_END}`);
// Legacy fallback for replies from before the sentinel contract: a single
// outer ``` block. GREEDY (`[\s\S]*`, no `?`) so it spans from the first ``` to
// the LAST ```, capturing the whole prompt WITH its inner ```json fences
// instead of stopping at the first inner fence (the original truncation bug).
const FENCE_GREEDY_RE = /```[^\n]*\n([\s\S]*)```/;

type BlockLocation = { content: string; start: number; end: number };

/**
 * Locates the prompt block in an assistant reply. A reply that uses the
 * sentinel contract (contains PROMPT_START) is matched by sentinels ONLY, so a
 * half-streamed reply never mis-triggers on the prompt's inner ``` fences.
 * A legacy reply (no sentinels) falls back to the greedy outer-fence match.
 * Returns null when there is no complete block yet (a clarifying question, or
 * output still streaming / cut off).
 */
function locatePromptBlock(reply: string): BlockLocation | null {
  const re = reply.includes(PROMPT_START) ? SENTINEL_RE : FENCE_GREEDY_RE;
  const match = reply.match(re);
  if (!match || match.index === undefined) return null;
  const content = match[1].trim();
  if (content.length === 0) return null;
  return { content, start: match.index, end: match.index + match[0].length };
}

/**
 * Extracts the updated prompt from an assistant reply, per the output contract:
 * the full prompt lives between the PROMPT_START / PROMPT_END markers (or, for
 * legacy replies, inside the outer fenced block). Returns null when the reply
 * has no complete block (the assistant only answered a question, or the output
 * was cut off), so the caller leaves the draft untouched.
 */
export function extractPromptFromReply(reply: string): string | null {
  return locatePromptBlock(reply)?.content ?? null;
}

/**
 * Splits a reply around its prompt block into the prose before it, the block
 * itself (null when there is no complete block), and the prose after it (the
 * "CAMBIOS REALIZADOS" summary). Shared by the server and the chat renderer so
 * both agree on exactly what the block is.
 */
export function splitPromptBlock(reply: string): {
  before: string;
  block: string | null;
  after: string;
} {
  const loc = locatePromptBlock(reply);
  if (!loc) return { before: reply, block: null, after: "" };
  return { before: reply.slice(0, loc.start), block: loc.content, after: reply.slice(loc.end) };
}

/**
 * Whether the reply opened a prompt block that never closed: a strong signal
 * the response was cut off mid-generation (hit max_tokens, dropped connection)
 * rather than the assistant choosing not to emit a prompt. Distinguishes
 * "nothing to extract" (fine, a clarifying question) from "extraction failed
 * because the draft got cut" (needs a warning). Sentinel replies: START without
 * END. Legacy replies: an odd count of ``` fences.
 */
export function hasUnclosedPromptBlock(reply: string): boolean {
  if (reply.includes(PROMPT_START)) return !reply.includes(PROMPT_END);
  const matches = reply.match(/```/g);
  return (matches?.length ?? 0) % 2 === 1;
}

/**
 * Extracts the change summary from an assistant reply: the prose the persona
 * writes AFTER the prompt block (its "CAMBIOS REALIZADOS" report). Used when
 * finalizing an Editor session to persist, per version, what changed. Removes
 * the prompt block robustly (so a prompt containing ``` never leaks into the
 * summary), strips `**bold**`, and drops the boilerplate "SIN CAMBIOS" tail.
 * Returns null when there's nothing meaningful after the block.
 */
export function extractChangeSummary(reply: string): string | null {
  const loc = locatePromptBlock(reply);
  const withoutBlock = (
    loc ? reply.slice(0, loc.start) + reply.slice(loc.end) : reply
  ).trim();
  if (!withoutBlock) return null;
  // Cut the trailing "SIN CAMBIOS ..." confirmation, keeping only real changes.
  const trimmed = withoutBlock.replace(/\n*\**\s*SIN CAMBIOS[\s\S]*$/i, "").trim();
  const cleaned = (trimmed || withoutBlock).replace(/\*\*/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

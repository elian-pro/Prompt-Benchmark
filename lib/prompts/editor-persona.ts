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
1. Entrega el prompt COMPLETO ya con los cambios integrados, dentro de un único bloque de código markdown (delimitado por triple backtick). El bloque debe contener exclusivamente el prompt, listo para copiar y pegar.
2. Fuera del bloque de código, al final, incluye este resumen:

**CAMBIOS REALIZADOS:**
- Sección modificada: [nombre]
- Tipo de cambio: [qué se hizo en una línea]
- Líneas/elementos afectados: [descripción breve]

**SIN CAMBIOS:**
- Todo lo demás del prompt permanece idéntico.

Si el usuario solo hace una pregunta o pide una aclaración sin solicitar una edición, responde con texto normal y NO incluyas el bloque de código ni el resumen.`;

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

/**
 * Extracts the updated prompt from an assistant reply, per the output contract:
 * the full prompt lives inside the first fenced code block. Returns null when
 * the reply has no code block (the assistant only answered a question and did
 * not produce a new draft), so the caller leaves the draft untouched.
 */
export function extractPromptFromReply(reply: string): string | null {
  // First fenced block; tolerate an optional language tag after the backticks.
  const match = reply.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!match) return null;
  const extracted = match[1].trim();
  return extracted.length > 0 ? extracted : null;
}

/**
 * Whether the reply opened a fenced block that never closed — a strong
 * signal the response was cut off mid-generation (hit max_tokens, dropped
 * connection) rather than the assistant simply choosing not to include a
 * prompt block. extractPromptFromReply already returns null in both cases;
 * this distinguishes "nothing to extract" (fine — a clarifying question)
 * from "extraction failed because the draft got cut" (needs a warning).
 * Heuristic: counts ``` occurrences — an odd count means one never closed.
 * False positives would require literal ``` inside the assistant's own
 * prose, which the persona's output contract never produces.
 */
export function hasUnclosedFence(reply: string): boolean {
  const matches = reply.match(/```/g);
  return (matches?.length ?? 0) % 2 === 1;
}

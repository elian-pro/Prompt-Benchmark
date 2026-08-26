/**
 * The team's canonical conversation states.
 *
 * Every client prompt the Studio produces answers in JSON shaped
 * `{"estado": "...", "mensajes": [...]}`, and n8n routes on `estado`. Until
 * now no list of the valid values existed anywhere in the codebase: the state
 * travelled as an opaque string from the parser to the UI, and the Creator was
 * told to copy "the state system" from whatever PROMPT BASE the user picked
 * (creator-persona.ts). A crooked base produced a crooked new prompt.
 *
 * This module is the single source. Kept dependency free on purpose: both the
 * prompt personas and the runtime parsing import it.
 *
 * Clients may add sub-states when their brief calls for it, always as a
 * specialization layered on top of one of these seven, never replacing or
 * renaming one. That is why nothing here validates a state as an enum: a
 * sub-state is legitimate and must not be rejected.
 */

export const ESTADOS = [
  "por-perfilar",
  "perfilado",
  "no-perfila",
  "lead-no-interes",
  "lead-grosero",
  "mensaje-aut",
  "humano",
] as const;

export type Estado = (typeof ESTADOS)[number];

/** True only for the seven. A client sub-state returns false: it is valid in a
 *  prompt, it just isn't one of the canonical names. */
export function isEstadoCanonico(value: string | null | undefined): value is Estado {
  return typeof value === "string" && (ESTADOS as readonly string[]).includes(value);
}

/**
 * The standing states contract, appended after the persona in both
 * buildEditorSystemPrompt and buildCreatorSystemPrompt, exactly like
 * OPTIONS_CONTRACT and ANTI_OVERFIT_CONTRACT and for the same reason: a saved
 * persona override in Settings must not silently drop it.
 *
 * One contract for both sections. The rules split by role at the end, so the
 * list of states cannot drift between two separate texts.
 *
 * Written out by hand rather than generated from ESTADOS: each state needs its
 * trigger explained, and those definitions come from the team's production
 * prompts. Spanish (it faces the model and the team's Spanish prompts), no em
 * dashes.
 */
export const ESTADOS_CONTRACT = `ESTADOS DE LA CONVERSACIÓN (obligatorio en todo prompt de cliente que construyas o modifiques):

El agente responde siempre con un sobre JSON y nada más:
{"estado": "...", "mensajes": ["...", "..."]}
"mensajes" lleva un elemento por burbuja, tal como n8n las entrega a WhatsApp. No agregues otros campos al sobre.

LOS SIETE ESTADOS. Se escriben exactamente así, en minúsculas y con guion, nunca traducidos, renombrados ni abreviados:
- por-perfilar: el lead todavía no completa todas las respuestas positivas del perfilamiento.
- perfilado: completó todas las positivas y demuestra intención. Cierra con una invitación cálida a continuar con el equipo humano.
- no-perfila: el perfil no corresponde a lo que busca este cliente. Los criterios de descalificación los define cada cliente en su prompt.
- lead-no-interes: no hay interés real, o solo está investigando. Va con "mensajes" vacío.
- lead-grosero: el lead fue ofensivo. Va con "mensajes" vacío.
- mensaje-aut: mensaje automático, o texto sin sentido. Va con "mensajes" vacío.
- humano: el lead está frustrado, pide hablar con una persona, falta información que el agente no tiene, o rechazó lo que se le ofreció.

REGLAS:
1. Presencia. Los siete se definen en TODO prompt, aunque el giro del cliente haga que alguno se dispare poco. Ninguno se omite ni se sustituye por otro nombre.
2. Sub-estados. Solo si el brief del cliente los pide. Un sub-estado especializa a uno de los siete, nunca lo reemplaza ni lo renombra, y el prompt debe dejar claro de cuál cuelga.
3. Cuando CONSTRUYES un prompt nuevo: escribe siempre la sección de estados con los siete y sus criterios de disparo, sin esperar a que el usuario te la pida. Si el PROMPT BASE que recibes usa otros nombres, mandan estos siete, no los del base.
4. Cuando EDITAS un prompt que ya está en producción: si trae estados fuera de esta lista, dilo en tu respuesta y ofrece homologarlo, pero NO lo cambies por tu cuenta. Los estados solo se tocan si el usuario lo aprueba de forma explícita, y entonces es un cambio dentro del alcance como cualquier otro.`;

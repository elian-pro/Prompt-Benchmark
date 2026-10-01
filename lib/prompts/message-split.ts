/**
 * Message-split contract: how many bubbles a client agent may send per turn.
 *
 * Meta now charges per message, so the team's rule dropped from up to four
 * elements in `mensajes` to three. Production prompts and old PROMPT BASEs still
 * carry the four-bubble rule, so, like the canonical states, the limit lives
 * here as a standing contract instead of being copied from whatever base the
 * Creator was handed.
 *
 * Appended AFTER the persona in both buildEditorSystemPrompt and
 * buildCreatorSystemPrompt, right after ESTADOS_CONTRACT and for the same
 * reason: a saved persona override in Settings must not silently drop it.
 *
 * The Lab does not enforce the limit: it must behave like production, so an
 * old prompt that sends four bubbles has to show four there.
 *
 * Spanish (it faces the model and the team's Spanish prompts), no em dashes.
 */

export const MAX_MENSAJES = 3;

export const MESSAGE_SPLIT_CONTRACT = `DIVISIÓN DE MENSAJES (obligatorio en todo prompt de cliente que construyas o modifiques):

Cada mensaje de WhatsApp tiene costo, así que el agente manda como máximo ${MAX_MENSAJES} elementos en "mensajes" por turno. Todo prompt de cliente lleva una sección "REGLAS DE DIVISIÓN DE MENSAJES" con este contenido. Los ejemplos de abajo son ilustrativos: en el prompt del cliente reescríbelos con su producto, su pregunta de perfilamiento y su voz, nunca los copies.

### REGLAS DE DIVISIÓN DE MENSAJES

Máximo ${MAX_MENSAJES} elementos en el array \`mensajes\` por turno. Nunca 4 o más.

**Paso 1: recorta la información, no la voz**
Antes de escribir, define el mensaje mínimo del turno:
- ¿Qué me preguntó o qué necesita saber el usuario AHORA? Responde solo eso.
- Si quito esta frase, ¿se pierde información o se pierde mi voz? Si no se pierde ninguna de las dos, quítala.
- La información que no pidió se guarda para un turno siguiente.

Relleno es lo que no aporta ni información ni voz. Elimina:
- Repetir lo que el usuario acaba de decir.
- Introducciones que retrasan la respuesta: "te comento que", "como te mencionaba", "para responder a tu pregunta".
- Cortesías apiladas: una basta, nunca dos seguidas.
- Adjetivos de venta vacíos: "increíble", "excelente opción", "te va a encantar".

**Paso 2: conserva la voz**
Breve no significa seco. La voz vive en CÓMO lo dices, no en oraciones extra.
- Cada turno lleva al menos un toque de tu voz: una expresión tuya, tu forma de arrancar una respuesta o de hacer una pregunta.
- Usa las expresiones y el ritmo definidos en tu personalidad. Esos no son relleno.
- Prueba final: ¿esto suena a mí platicando por WhatsApp o a un formulario? Si suena a formulario, devuélvele una expresión tuya sin agregar información.

**Paso 3: divide**
- 1 elemento: la respuesta cabe en 1 o 2 oraciones, con o sin pregunta.
- 2 elementos: hay información y además una pregunta. Elemento 1 la información, elemento 2 la pregunta.
- 3 elementos: solo cuando el usuario necesita AHORA dos ideas distintas y además hay una pregunta. Elementos 1 y 2 la información, elemento 3 la pregunta. Si cabe en 2, usa 2.

**Límites por elemento**
- Máximo 2 oraciones y 50 palabras.
- Si no cabe, no lo comprimas ni agregues un cuarto elemento: di lo más importante y deja el resto para el siguiente turno.

**Criterios de corte**
- Cada elemento se entiende solo, como un globo enviado por una persona.
- Corta entre ideas distintas, nunca a media idea.
- Una sola pregunta de perfilamiento por turno, siempre al final del último elemento.
- Si hay 2 o 3 elementos, la pregunta va sola en el último.

**Ejemplo de 1 elemento:**
{"estado": "por-perfilar", "mensajes": ["Nos movemos en el Querétaro Moderno, sobre todo en Zibatá. Cuéntame, ¿lo buscas para vivir, para invertir o ambas?"]}

**Ejemplo de 2 elementos:**
{"estado": "por-perfilar", "mensajes": ["Nuestra asesoría no te cuesta nada, trabajamos por convenio con los desarrollos.", "Cuéntame, ¿lo buscas para vivir, para invertir o ambas?"]}

**Ejemplo de 3 elementos:**
Usuario: "¿Cobran por la asesoría? ¿Y me ayudan con el crédito?"
{"estado": "por-perfilar", "mensajes": ["Para nada, la asesoría no te cuesta. Trabajamos por convenio con los desarrollos.", "Y sí, te acompañamos con el crédito de principio a fin.", "Cuéntame, ¿lo buscas para vivir, para invertir o ambas?"]}

**Ejemplo de recorte**
Usuario: "¿Cobran por la asesoría?"

Incorrecto por saturado: tres globos cuando bastaban dos, que abren con "¡Claro que sí! Con mucho gusto te comento que...", agregan información que no pidió (crédito, escrituración, opciones que "te van a encantar") y dejan la pregunta en un tercer globo.

Incorrecto por plano (breve pero sin voz, suena a formulario):
{"estado": "por-perfilar", "mensajes": ["No. Asesoría sin costo.", "¿Vivir, invertir o ambas?"]}

Correcto (breve y con voz):
{"estado": "por-perfilar", "mensajes": ["Para nada, la asesoría no te cuesta. Trabajamos por convenio con los desarrollos.", "Cuéntame, ¿lo buscas para vivir, para invertir o ambas?"]}

REGLAS PARA TI:
1. Cuando CONSTRUYES un prompt nuevo: escribe siempre esta sección, sin esperar a que el usuario te la pida. Si el PROMPT BASE permite 4 o más elementos, manda este contrato, no el base.
2. Cuando EDITAS un prompt que ya está en producción: si permite más de ${MAX_MENSAJES} elementos (una regla como "máximo 4", ejemplos con 4 o más globos, o ningún límite), dilo en tu respuesta y ofrece homologarlo, pero NO lo cambies por tu cuenta. Solo se toca si el usuario lo aprueba de forma explícita.
3. En cualquier prompt que escribas o modifiques, ningún ejemplo de respuesta lleva más de ${MAX_MENSAJES} elementos en "mensajes".`;

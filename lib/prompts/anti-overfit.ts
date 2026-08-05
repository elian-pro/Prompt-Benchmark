/**
 * Anti-overfitting contract for rule writing.
 *
 * A reported case is a symptom. Left alone, both personas transcribe it
 * literally ("si preguntan por el gimnasio, di que abre a las 6am"), and the
 * client's prompt accumulates one dead-literal rule per conversation instead of
 * one criterion per behavior. This is the team's four-test checklist, written
 * as a standing contract.
 *
 * Appended AFTER the persona in both buildEditorSystemPrompt and
 * buildCreatorSystemPrompt, exactly like OPTIONS_CONTRACT and for the same
 * reason: a saved persona override in Settings must not silently drop it.
 *
 * Spanish (it faces the model and the team's Spanish prompts), no em dashes.
 */

export const ANTI_OVERFIT_CONTRACT = `CÓMO ESCRIBIR UNA REGLA QUE NO SOBREAJUSTE (obligatorio siempre que escribas o modifiques una regla de comportamiento del agente):
El caso que te reportan es un síntoma, no la regla. Antes de insertar o cambiar una regla, pásala por estos cuatro filtros:

1. Nivel de abstracción: sube un nivel desde el caso concreto. La regla debe cubrir el caso reportado y los hermanos que todavía no aparecen. En vez de "si preguntan por el gimnasio, di que abre a las 6am", escribe "cuando pregunten horarios de amenidades, responde con el dato exacto de la base de conocimiento; si no está, ofrece confirmarlo en la cita".
2. Principio antes que ejemplo: enuncia el criterio y usa el ejemplo solo para ilustrarlo. Si borras el ejemplo, la regla debe seguir entendiéndose sola. Nunca dejes una regla que sea únicamente un guion literal.
3. Ninguna prohibición aislada: una regla escrita solo en negativo deja al agente sin ruta alternativa y produce respuestas evasivas. Toda prohibición lleva su reemplazo, qué hacer en su lugar y hacia dónde llevar la conversación. En vez de "no hables de financiamiento", escribe "el financiamiento lo explica el asesor en la cita: reconoce la duda y úsala como razón para agendar".
4. Prueba de conflicto: antes de insertar, busca en el prompt las reglas que ya tocan ese tema. Si alguna contradice o duplica lo nuevo, resuélvelo en el mismo cambio, ajustando o eliminando la vecina, en vez de dejar dos reglas peleando. Esa regla vecina queda dentro del alcance del cambio y la reportas en el resumen. Si la forma de resolver el conflicto no es obvia, pregunta antes de editar.

Alcance: esto aplica al comportamiento del agente. Los datos verificados por el cliente (precios, fechas, horarios, condiciones, nombres, ubicaciones) se escriben tal cual, sin generalizar.
Si el usuario pide expresamente una redacción literal, aplícala tal como la pidió y añade una sola línea en tu resumen advirtiendo que esa regla solo cubre el caso exacto.`;

# Sprint 17: Replay (conversaciones reales como casos)

> Estado: CÓDIGO COMPLETO, PENDIENTE DE VERIFICACIÓN. Los cinco tickets están
> implementados y las migraciones 020 y 021 ya corrieron en prompt_studio.
> Falta desplegar la rama y hacer la prueba end to end con un cliente que
> escriba `turnos` (Fernando Wagner, Kuyabeh o Chapur): buscar una
> conversación, marcar el turno, editar, promover, correr el replay.
>
> Dos desvíos respecto a este plan, ambos por buenas razones:
>
> - T4 tuvo que incluir el panel de casos, porque un endpoint sin punto de
>   entrada es código muerto. T5 quedó reducido al veredicto. Ese panel nació
>   por error en la ficha de Biblioteca y se movió a Lab, que es donde este
>   plan siempre dijo que vivía.
> - El filtro de estado final de T1 no se implementó como columna propia: hoy
>   se alcanza por la búsqueda de texto, porque los flujos escriben el estado
>   también en `historial`. La versión precisa (`turnos @> [{"estado": X}]`)
>   espera a que los 16 flujos escriban la columna.

## Contexto

Carlos no solo crea prompts, también da soporte. El ciclo real es: el cliente
reporta que el bot contestó mal, Carlos ubica esa conversación, encuentra el
error y lo traduce a una instrucción para el Editor. Hoy ese último paso pasa
por mandar capturas de pantalla, porque el Studio muestra el historial pero no
deja buscarlo, ni leerlo como conversación, ni comprobar que el cambio sirvió.

**Replay** cierra ese ciclo: encontrar la conversación que falló, marcarla,
editar el prompt, y volver a correr ese mismo turno contra la versión nueva
para ver si el problema se fue.

Cada conversación marcada queda guardada como un caso, con su versión y su
punto de falla. Ese conjunto es la materia prima del objetivo de largo plazo,
un loop que pula un prompt hasta pasar una batería de casos reales. El loop no
se construye aquí: es T4 corrido en lote, y sale casi gratis si T4 existe.

## Dónde vive y cómo se llama

**Replay es el tercer modo de Lab.** Lab es donde se pone a prueba el prompt
de un cliente, y los tres modos son la misma idea ordenada por realismo:

| Modo | Quién hace de lead |
|---|---|
| IA vs IA | una IA adversaria |
| Playground | tú, en vivo |
| **Replay** | **leads reales, ya ocurrió** |

El panel de "Historial de conversaciones" se queda en la ficha del cliente
(Biblioteca) como material de referencia, con un enlace de ida: marcar una
conversación como caso lleva a Replay.

Vocabulario: la sección es **Replay**, la unidad es un **caso**. "Marcar como
caso", "correr el replay", "18 de 20 casos pasan".

## Lo que ya está listo (2026-07-30)

- Columna `turnos jsonb` en las 16 tablas `chats_*` y en el DDL de las nuevas
  (`supabase/chats/002_add_turnos.sql`, `lib/chats-table-name.ts`).
- Trigger que la normaliza cuando n8n la escribe doble codificada
  (`supabase/chats/003_normalize_turnos.sql`).
- Flujos n8n escribiendo `turnos`: Plantilla, Fernando Wagner, Kuyabeh, y todo
  cliente provisionado desde la plantilla (Chapur ya nació con ella).
- Faltan 9 flujos con tabla por actualizar, cada uno necesita que le enciendan
  "Available in MCP". No bloquea T1 a T3, pero **sí bloquea T4 para esos
  clientes**: sin `turnos` no se puede reconstruir el historial fiel.

## Decisiones tomadas

1. **El `historial` viejo no se reescribe.** Las filas anteriores a `turnos` se
   leen con un parser tolerante al vuelo. Un parser que sabemos que se
   equivoca no debe sobrescribir el registro que está adivinando.
2. **El texto crudo siempre está a un clic.** El formato viejo es lo bastante
   sucio como para que el parser falle justo en las conversaciones raras, que
   son las que importan.
3. **Marcar el caso reusa el taggeo del Playground.** El mensaje que Carlos
   señala ES el punto de falla, y el punto de falla es lo que hace posible T4.
4. **El caso vive en `prompt_studio`, no en el proyecto chats.** Ese proyecto
   es la base de producción de los agentes y la arquitectura lo trata como
   solo lectura.
5. **El caso guarda un snapshot.** La fila original puede cambiar o la tabla
   rotarse; un caso que se desdibuja no sirve para nada.
6. **Búsqueda por cliente primero.** Global implica una query por cada tabla
   `chats_*` (hoy 16) y no paga todavía.
7. **El replay es por turno, no por conversación.** Ver T4.

## Los tickets

### S17-T1 · Buscar y filtrar el historial

Un solo campo de búsqueda que intenta tres cosas, porque el cliente nunca da
el id de la fila: da el lead. Acepta `id_de_kommo`, id de fila, y texto libre
contra `historial` (el nombre del lead está escrito ahí dentro).

| Filtro | Implementación |
|---|---|
| Texto | `.ilike('historial', '%...%')` |
| Fecha | rango sobre `created_at` |
| Longitud | `numero_de_mensajes`, el mejor detector barato de "salió mal": 1 o 2 mensajes significa que el lead se fue |
| Estado final | `turnos @> '[{"estado":"humano"}]'` donde haya turnos, `ilike` sobre `historial` donde no |

Cero DDL, todo PostgREST sobre `lib/db/chats-history.ts`.

**Definition of done**: pegar un id de Kommo encuentra la conversación;
filtrar por "menos de 3 mensajes" en el último mes devuelve los leads que se
fueron temprano.

### S17-T2 · Ver la conversación como chat

El modal actual muestra un `<pre>` con el blob. Pasa a burbujas reusando las
clases del Playground (`chat-turn`, `chat-msg`, `chat-state`).

- Con `turnos`, se renderiza de ahí, con el `estado` colgando de cada turno
  del bot igual que en el Playground.
- Sin `turnos`, parser tolerante sobre `historial`, marcado visiblemente como
  "reconstruido".
- Botón "Ver texto crudo" siempre presente.

**Definition of done**: una conversación con `turnos` se ve idéntica a una del
Playground; una vieja se ve razonable y se distingue que fue reconstruida.

### S17-T3 · Marcar el caso y mandarlo al Editor

Taggear el mensaje que falló y escribir la nota, igual que el Playground. Al
enviar se crea la sesión de Editor y se inserta el caso.

**El formato del handoff es distinto al del Playground, a propósito.**
`buildHandoffMessage` manda sólo las notas y los mensajes citados, lo cual
funciona ahí porque Carlos vivió la conversación. Una conversación real no la
vivió nadie: un mensaje citado suelto no deja juzgar si estuvo mal. Va la
conversación completa, marcada:

```
Conversación real de Chapur (lead Kommo 65030998, 29 jul 2026).
Prompt en producción cuando se marcó: v1.4

  1. lead: "Hola, vi su anuncio"
  2. bot  [activo]: "¡Qué tal! ¿De qué zona nos escribes?"
  3. lead: "De Mérida"
  4. bot  [activo]: "Perfecto. Tenemos disponibilidad desde 4.5 MDP"
     ^^^ AQUÍ ESTÁ EL PROBLEMA
  5. lead: "Ah ok, gracias"
  6. bot  [lead-no-interes]: ...

Lo que salió mal (nota de Carlos):
"Dio el precio antes de perfilar. El lead se enfrió de inmediato."

Esta es salida real de producción, no una simulación. Haz el cambio más
acotado que evite esto sin alterar el resto del flujo.
```

Por qué así:

- **Completa, no recortada.** Los datos reales son cortos (la conversación más
  larga en `chats_Sofia` son 1,670 caracteres; el prompt del Editor ya carga
  57 mil). Mandarla entera cuesta ruido y evita el modo de falla caro: que el
  Editor arregle algo sin entender por qué pasó.
- **Con el estado por turno**, que el handoff actual tira (`parseTurn`
  devuelve el mensaje y descarta el `estado`). En conversaciones reales el
  estado es lo que más diagnostica: "se quedó en `por-perfilar` tres turnos",
  "saltó a `humano` sin razón".
- **Texto plano, no el JSON de `turnos`.** El JSON gasta tokens en llaves sin
  agregar señal.
- **El turno marcado va dentro de la conversación**, no extraído aparte, para
  que el Editor lo vea en su contexto.

**Aviso de versión desfasada.** Una conversación real pudo haber sido generada
por una versión vieja del prompt. Si la conversación es anterior a la fecha de
la versión en producción, la UI lo advierte: editar sobre esa base puede
"arreglar" algo ya arreglado, o revertirlo.

Migración nueva (`020_conversation_cases.sql`):

```
conversation_cases
  id, client_id, chats_table, row_id
  historial_snapshot     -- congelado
  turnos_snapshot        -- congelado, null en filas viejas
  version_id             -- contra qué versión falló
  turno_index            -- DÓNDE falló, del mensaje taggeado
  nota                   -- el diagnóstico de Carlos
  editor_session_id      -- qué edición salió de aquí
  created_at
```

Las dos columnas críticas son `version_id` y `turno_index`. Sin la primera no
se sabe si el caso ya se arregló. Sin la segunda no hay T4.

**Definition of done**: Carlos marca una conversación real, escribe "no debió
dar el precio antes de perfilar", y aterriza en el Editor con el contexto
puesto. Queda la fila del caso. Ya no manda capturas.

### S17-T4 · Correr el replay

El corazón de la función. Contra la versión que se elija:

1. Se reconstruye el historial hasta el turno anterior al de la falla
   (`turnos_snapshot[0..turno_index-1]`).
2. Se manda como historial al prompt de la versión candidata: `chat()` con
   `systemPrompt` = esa versión, `messages` = el historial reconstruido. Misma
   mecánica que `app/api/demo-sessions/[id]/messages/route.ts`, con el
   historial sembrado en vez de vivo.
3. Se muestran las dos respuestas lado a lado: la real de producción y la
   nueva.

**Los turnos del bot van como el sobre JSON que emitió** (`{"estado":...,
"mensajes":[...]}`), reconstruido desde `turnos`. El modelo se guía por el
formato de sus propias respuestas anteriores: mandarlas como texto plano lo
saca del formato, que es exactamente el bug que se arregló en
`asEnvelope` (`lib/adversarial-message.ts`) para el mensaje de inicio del
Playground. Sin `turnos` esto no se puede reconstruir, y por eso T4 depende de
que el flujo del cliente ya escriba la columna.

Dos límites, explícitos en la UI:

- **Verifica un turno, no la conversación.** En cuanto el bot contesta
  distinto, el mensaje siguiente del lead real ya no viene al caso. No es una
  limitación del diseño sino de la realidad, y alcanza: el bug estaba en un
  turno.
- **No reproduce herramientas ni variables.** El bot real tenía el nombre del
  lead, campos de Kommo, quizá RAG. El replay corre con prompt e historial
  nada más. Sirve para regresiones de prompt, no para bugs de tool.

**Definition of done**: sobre un caso marcado, correr el replay contra la
versión nueva muestra la respuesta vieja y la nueva lado a lado, y Carlos
puede decidir si el caso pasa.

### S17-T5 · Listar los casos de un cliente

Lista en la sección, con su versión, su nota y si ya pasan. Lo mínimo para que
los casos no sean un cajón de escritura.

**Definition of done**: se puede contestar "¿qué le hemos arreglado a este
cliente y cuándo?" sin abrir n8n ni Supabase.

## Fuera de alcance, a propósito

Nada de juez automático sobre el resultado del replay, ni criterio de paro, ni
corrida en lote. T4 deja a Carlos comparando a ojo, que para 5 casos es lo
correcto.

## El loop, cuando toque

Cuando haya 20 casos y comparar a ojo canse, el loop es T4 en un `for` más un
juez que dictamine cada comparación, con criterio de paro medible ("18 de 20
casos pasan"), nunca "el modelo dice que ya quedó". Las piezas ya existen: el
Adversarial Lab tiene juez con reporte estructurado, el Editor edita, el
versionado compara. No hay que diseñar nada nuevo.

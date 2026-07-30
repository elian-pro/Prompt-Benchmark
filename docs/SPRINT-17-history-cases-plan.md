# Sprint 17: buscar el historial real y convertirlo en casos

> Estado: PLANEADO. La plomería de datos ya está hecha (ver "Lo que ya está
> listo"). Faltan los cuatro tickets de este documento.

## Contexto

Carlos no solo crea prompts, también da soporte. El ciclo real es: el cliente
reporta que el bot contestó mal, Carlos ubica esa conversación, encuentra el
error y lo traduce a una instrucción para el Editor. Hoy ese último paso pasa
por mandar capturas de pantalla, porque el Studio muestra el historial pero no
deja buscarlo ni leerlo como conversación.

Este sprint cierra ese ciclo. Y lo hace de forma que el trabajo de soporte del
día a día deje sedimento: cada conversación que Carlos marca como mala se
guarda como un caso, con su versión y su punto de falla. Ese conjunto de casos
es la materia prima del objetivo de largo plazo, un loop que pula un prompt
hasta que pase una batería de casos reales.

**El loop NO se construye en este sprint.** Lo único que se hace por él es no
tirar el caso.

## Lo que ya está listo (2026-07-30)

- Columna `turnos jsonb` en las 16 tablas `chats_*` y en el DDL de las nuevas
  (`supabase/chats/002_add_turnos.sql`, `lib/chats-table-name.ts`).
- Trigger que la normaliza cuando n8n la escribe doble codificada
  (`supabase/chats/003_normalize_turnos.sql`).
- Flujos n8n escribiendo `turnos`: Plantilla, Fernando Wagner, Kuyabeh, y todo
  cliente nuevo provisionado desde la plantilla (Chapur ya nació con ella).
- Faltan 9 flujos con tabla por actualizar, cada uno necesita que le enciendan
  "Available in MCP". No bloquea nada de este sprint: la UI lee `turnos`
  cuando existe y cae al parser cuando no.

## Decisiones tomadas

1. **El `historial` viejo no se reescribe.** Las filas anteriores a `turnos`
   se leen con un parser tolerante al vuelo. Un parser que sabemos que se
   equivoca no debe sobrescribir el registro que está adivinando.
2. **El texto crudo siempre está a un clic.** El formato viejo es lo bastante
   sucio como para que el parser falle justo en las conversaciones raras, que
   son las que importan.
3. **Marcar el caso reusa el taggeo del Playground.** El mensaje que Carlos
   señala ES el punto de falla, y el punto de falla es lo que después permite
   evaluar por turno. No se diseña nada nuevo para el futuro: se reusa lo que
   ya existe y el futuro sale gratis.
4. **El caso vive en `prompt_studio`, no en el proyecto chats.** Ese proyecto
   es la base de producción de los agentes y la arquitectura lo trata como
   solo lectura.
5. **El caso guarda un snapshot.** La fila original puede cambiar o la tabla
   rotarse; un caso que se desdibuja no sirve como evaluación.
6. **Búsqueda por cliente primero.** Global implica una query por cada tabla
   `chats_*` (hoy 16) y no paga todavía.

## Los tickets

### S17-T1 · Buscar y filtrar el historial

Un solo campo de búsqueda que intenta tres cosas, porque el cliente nunca da
el id de la fila: da el lead. Acepta `id_de_kommo`, id de fila, y texto libre
contra `historial` (el nombre del lead está escrito ahí dentro).

Filtros, todos sobre columnas que ya existen:

| Filtro | Implementación |
|---|---|
| Texto | `.ilike('historial', '%...%')` |
| Fecha | rango sobre `created_at` |
| Longitud | `numero_de_mensajes`, el mejor detector barato de "salió mal": 1 o 2 mensajes significa que el lead se fue |
| Estado final | `turnos @> '[{"estado":"humano"}]'` donde haya turnos, `ilike` sobre `historial` donde no |

Cero DDL. Todo es PostgREST sobre `lib/db/chats-history.ts`.

**Definition of done**: desde la ficha de un cliente, pegar un id de Kommo
encuentra la conversación; filtrar por "menos de 3 mensajes" en el último mes
devuelve la lista de leads que se fueron temprano.

### S17-T2 · Ver la conversación como chat

El modal actual muestra un `<pre>` con el blob. Pasa a render de burbujas
reusando las clases del Playground (`chat-turn`, `chat-msg`, `chat-state`).

- Si la fila tiene `turnos`, se renderiza de ahí, con el `estado` colgando de
  cada turno del bot igual que en el Playground.
- Si no, parser tolerante sobre `historial`, marcado visiblemente como
  "reconstruido".
- Botón "Ver texto crudo" siempre presente.

**Definition of done**: una conversación con `turnos` se ve idéntica a una del
Playground; una vieja se ve razonable y se distingue que fue reconstruida.

### S17-T3 · Marcar el caso y mandarlo al Editor

Taggear mensajes y escribir la nota, igual que el Playground. Al enviar:

- Se crea la sesión de Editor sobre la versión que el cliente tiene en
  producción, reusando `buildHandoffMessage` y `createChatSession`.
- Se inserta la fila en `conversation_cases`.

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
se sabe si el caso ya se arregló. Sin la segunda, el día del loop hay que
releer todos los casos a mano para ubicar el problema, y ahí se muere el
proyecto.

**Definition of done**: Carlos marca una conversación real, escribe "no debió
dar el precio antes de perfilar", y aterriza en el Editor con el contexto
puesto. Queda la fila del caso. Ya no manda capturas.

### S17-T4 · Listar los casos de un cliente

Lo mínimo para que los casos no sean un cajón de escritura: lista en la ficha,
con su versión, su nota y si la versión que salió del Editor ya los superó.

**Definition of done**: se puede contestar "¿qué le hemos arreglado a este
cliente y cuándo?" sin abrir n8n ni Supabase.

## Fuera de alcance, a propósito

Nada de runner de evaluación, juez sobre casos reales, criterio de paro, ni UI
de suite. Todo eso se para encima de `conversation_cases` el día que exista.
Construirlo antes es código muerto.

## El loop, cuando toque (contexto, no trabajo de este sprint)

Las piezas ya existen casi todas: el Adversarial Lab tiene lead simulado y
juez con reporte estructurado, el Editor edita, y el versionado compara. Lo
que falta es correr N casos contra una versión candidata.

El problema honesto es que **una conversación real no se puede reproducir
completa**: en cuanto el bot contesta distinto en el turno 3, el mensaje 4 del
lead real ya no viene al caso y lo que sigue es ruido. La salida barata y
correcta es evaluar por turno: se toma la conversación hasta el punto de falla
(`turno_index`), se manda solo ese contexto a la versión candidata, y el juez
califica esa única respuesta. Determinista, barato, y es exactamente el bug
que el cliente reportó.

Criterio de paro medible ("18 de 20 casos pasan"), nunca "el modelo dice que
ya quedó".

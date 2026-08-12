# Sprint 18: Demo, el link de pruebas del cliente

> Estado: código completo y `023_demo_links.sql` aplicada en prompt_studio el
> 2026-08-04 (las 12 conversaciones y 14 notas que ya existían quedaron como
> estaban, con `link_id` nulo y `source='admin'`, `status='approved'`). Pendiente
> la verificación end to end contra la app corriendo. Todo salió como estaba
> planeado salvo dos cosas anotadas abajo: el header del Studio acabó siendo un
> componente propio en vez de una regla CSS, y la ruta para revisar una nota
> cuelga de su conversación en vez de llevar el `sessionId` por querystring.

## Contexto

El cliente probaba su agente en un flujo de n8n y devolvía el feedback por
WhatsApp: audios, capturas, mensajes sueltos a cualquier hora. Hace unas semanas
eso se sustituyó por un Google Doc editable, `{Cliente} _ Pruebas y Validación
Chat IA`, que le pedía cuatro cosas por hallazgo: captura de la conversación,
descripción del error, respuesta correcta y comentarios.

El doc ordenó el formato pero no el problema. Sigue siendo trabajo manual del
cliente, la captura se separa de la conversación real, y no queda rastro de
quién dijo qué ni cuándo. Cuando semanas después alguien reclama un cambio que
no pidió, no hay nada que enseñar.

Casi todo lo que hace falta ya existía: el Playground es exactamente ese chat,
con notas ancladas a mensajes y salida al Editor. Lo que faltaba era poder
enseñárselo al cliente sin darle el Studio.

## Dónde vive y cómo se llama

| Concepto | Nombre | Dónde |
|---|---|---|
| El modo de Lab | Demo | `/lab/demo` |
| Lo que se le manda al cliente | Link de pruebas | `/prueba/<token>` |
| Una ronda de pruebas | `demo_links` | una fila por cliente y versión |
| Lo que escribe una persona | Conversación | `demo_sessions` con `link_id` |
| Lo que reporta | Reporte, o nota | `demo_notes` con `source='client'` |

## Decisiones tomadas

1. **Reusar las tablas del Playground en vez de crear otras.** Una conversación
   de link es una `demo_sessions` con `link_id`. Eso hereda gratis el motor del
   chat, las notas ancladas y el handoff. El precio es que hubo que aislar
   explícitamente las dos cosas: `listSessions` y "vaciar historial" filtran
   `link_id is null`, y borrar una conversación de cliente por separado está
   prohibido. Ese botón, sin el filtro, borraba la evidencia.

2. **Visitante anónimo.** Sin nombre ni correo. Una cookie firmada `zebra_demo`
   con un id aleatorio identifica el dispositivo, y junto a la conversación se
   guarda IP, user agent y fechas. Pedir el nombre habría dado mejor
   trazabilidad, pero también fricción justo en el momento en que queremos que
   el cliente empiece a escribir, y su equipo pasa el link entre ellos.

3. **La nota tiene dos campos, no cuatro.** "Qué está mal" y "qué debió
   responder". La captura del doc la sustituye el marcado de turnos, que es
   mejor: apunta al mensaje exacto en vez de a una imagen. Los "comentarios
   adicionales" del doc caben en el primer campo.

4. **Nada del cliente llega al Editor sin aprobación.** Una nota de cliente nace
   `pending`. El filtro vive dentro de `buildHandoffMessage`, no en las rutas
   que lo llaman: si mañana alguien añade otra forma de mandar al Editor y
   olvida filtrar, la nota sin revisar no pasa igual. El usuario puede reescribir
   la nota antes de aprobarla, porque el cliente describe un síntoma y el Editor
   necesita una instrucción. Lo que el cliente escribió original sigue en la
   conversación.

5. **Un link por cliente y versión, multi persona.** El prompt se congela al
   crearlo. Si se edita la versión a mitad de ronda, el cliente sigue probando lo
   que se le dijo que probara. Cerrar el link revoca la URL y conserva todo;
   eliminarlo es lo único que borra la evidencia, y va detrás del modal de dos
   pasos.

6. **Topes duros, dos niveles.** Es el primer endpoint del proyecto que gasta
   dinero en un modelo sin login delante. Por link, `max_sessions` y
   `max_messages`. Por IP, un limitador en memoria (`lib/rate-limit.ts`): un
   mensaje cada 3 segundos, 30 por hora.

7. **Aviso dentro del Studio, no por correo.** Badge en el header y notificación
   del navegador, calcados de `GenerationWatcher`. No se añadió ninguna
   dependencia ni webhook.

## Lo que ya está listo (2026-08-04)

- `023_demo_links.sql`: tabla `demo_links`, columnas nuevas en `demo_sessions`
  (`link_id`, `visitor_*`, `last_seen_at`) y en `demo_notes` (`source`,
  `status`, `expected`). Los defaults dejan las filas del Playground como
  estaban.
- `lib/auth/signed-token.ts`: firma y verificación genéricas, extraídas de
  `lib/auth/session.ts`. Las usan la cookie del login y la del visitante, en vez
  de dos implementaciones del mismo HMAC.
- `lib/demo-link-guard.ts`: resuelve token, cookie, topes y rate limit. Ninguna
  ruta pública toca la base antes de llamarlo.
- `lib/demo-turn.ts`: el turno, compartido por el Playground y el link, para que
  el cliente y el usuario vean exactamente lo mismo.
- `components/demo/DemoTurn.tsx`: la burbuja, compartida por las tres vistas.
- `components/layout/AppHeader.tsx`: el header del Studio, que devuelve `null` en
  `/prueba`. Ocultarlo por CSS dejaba a `GenerationWatcher` encuestando una API
  cerrada cada cinco segundos desde el navegador del cliente.
- `middleware.test.ts`: recorre el árbol de rutas y falla si aparece una que
  comparta prefijo con las excluidas.

## Ajustes después de la primera prueba (2026-08-04)

1. **El reporte muestra qué mensaje marcaste.** Antes decía solo "1 mensaje
   seleccionado", y el chat ya se había ido hacia arriba: no había forma de
   comprobar que marcaste el correcto. Ahora cita el mensaje, tanto al escribir
   como en los reportes ya enviados, con la misma lógica del Playground
   (`messagePreview` en `lib/adversarial-message.ts`, compartido por las tres
   vistas).

2. **El cliente puede reiniciar la conversación.** `POST /api/prueba/<token>/reset`.
   Sube de ronda, no borra: los mensajes viejos salen de la vista pero siguen en
   la base, así que los reportes ya enviados siguen apuntando al mensaje exacto,
   y un cliente no puede limpiar el historial antes de que alguien lo lea. Por
   eso la vista pública y la de admin ahora reciben `note_messages`, los turnos
   de rondas anteriores que alguna nota todavía cita. El tope de mensajes cuenta
   todas las rondas, así que reiniciar no lo esquiva.

3. **El reporte lo encabeza el arreglo, no la queja.** "Qué debió responder" pasó
   a ser el campo obligatorio y "qué estuvo mal" el opcional: lo primero es lo
   que hace que el prompt se edite, y lo segundo casi siempre se lee solo en el
   mensaje marcado. Eso obligó a `024_demo_note_text_optional.sql`, que quita el
   `not null` de `demo_notes.text`. La regla de "al menos uno de los dos" vive en
   el esquema de Zod y no en la base, porque cambia según quién escribe: el
   Playground tiene un solo campo libre y ningún `expected`.

4. **La página dice qué es.** Cerrado el modal de instrucciones solo quedaba un
   chat con el nombre del cliente. Ahora el header lleva título.

4b. **La tarjeta de WhatsApp no mostraba imagen.** No era la imagen, era la URL:
   `metadataBase` salía de `AUTH_BASE_URL`, y si esa variable no está puesta
   caía a `http://localhost:3000`, así que WhatsApp intentaba bajar el
   `og:image` de ahí y se quedaba sin nada. Ahora el origen se deriva de las
   cabeceras de la petición (`lib/base-url.ts`, compartido con el redirect de
   OAuth), así que funciona esté o no la variable. La imagen generada con
   `next/og` se sustituyó por el arte de marca, `opengraph-image.png`.

5. **El botón de reiniciar explica qué hace**, con un `InfoHint` que aclara lo
   que más preocupa: que no borra los reportes ya enviados.

6. **Token más corto**: 12 caracteres en vez de 32 (9 bytes, 72 bits). Sigue
   siendo inadivinable contra un endpoint que responde 404 y limita por IP.
   El prefijo `/prueba` **no** se acortó: el lookahead del matcher no está
   anclado a un segmento, así que excluir `/p` dejaría fuera del login cualquier
   ruta que empiece por «p». Si algún día se quiere `/p/<token>`, hay que
   excluir `p/` con la barra incluida, no `p`.

## Los tickets

Todos completos. `S18-T0` migración, `T1` capa de datos y guard, `T2` rutas
públicas, `T3` página del cliente, `T4` Open Graph, `T5` vista de admin, `T6`
aprobación y handoff, `T7` aviso, `T8` esta documentación.

**Definition of done del sprint**: se manda un link, el cliente prueba desde su
celular sin ver una sola pantalla de admin, reporta algo sobre un mensaje
concreto, el usuario recibe el aviso, lo lee en contexto, lo aprueba y llega al
Editor con el turno marcado y la respuesta esperada. Cero capturas de pantalla y
cero Google Docs.

## Añadido después del plan: la bandeja de cambios

El sprint dejó la revisión colgando de la conversación, y esa desviación
anotada arriba (la nota solo es alcanzable navegando link, conversación, nota)
resultó ser la fricción real: el usuario tenía que entrar una por una y la tanda
que llegaba al Editor la decidía la conversación, no él.

`/lab/demo/cambios` es la pestaña que lee todos los reportes de un cliente
juntos, filtrados por estado, con el turno citado en cada tarjeta para poder
decidir sin abrir la conversación. Aprobar y descartar usan el mismo `PATCH` de
siempre, que autoriza por link, conversación y nota. Enviar al Editor manda todo
lo aprobado que no se haya enviado, agrupado por la versión contra la que se
escribió cada reporte y sobre la más reciente de la tanda como versión base.

`demo_notes.sent_to_editor_at` y `editor_session_id` (migración `028`) son lo
que impide que la misma instrucción viaje dos veces ahora que un reporte se
alcanza desde dos sitios. El filtro vive dentro de `approvedNotes`, junto al de
aprobación y por la misma razón: una ruta nueva que lo olvide sigue sin poder
reenviar.

Sigue fuera de alcance deshacer un envío, y la bandeja no muestra las notas que
el usuario se escribe a sí mismo en el Playground.

## Fuera de alcance, a propósito

- Adjuntos en la demo pública. `uploads.session_id` apunta a `chat_sessions`,
  así que darle archivos al cliente es una migración aparte.
- Correo, WhatsApp o webhook de aviso.
- Identidad del visitante por nombre o correo.
- Que el cliente recupere su conversación desde otro dispositivo.
- Analítica de la demo: turnos por sesión, temas más preguntados, qué versión
  generó más reportes.

## Cuando toque escalarlo

El limitador por IP vive en memoria, así que los contadores son por instancia y
se reinician en cada deploy. Está bien para un solo contenedor, que es como
corre hoy en EasyPanel. Si algún día hay más de uno, mover los golpes a Postgres
o Redis; los topes de `demo_links` son el respaldo real y esos sí son globales.

# Plan: Sprint 8, rediseño de Playground

> Estado: PROPUESTA. Nada implementado. Este documento se pule antes de
> escribir código. Cinco cambios pedidos por el equipo, entregados por
> tickets (no todo de una). Cuando se apruebe, se ejecuta ticket por ticket
> y al final se archiva como `docs/SPRINT-8-archive.md`.

## 1. Contexto actual (verificado en el código)

Playground (`app/lab/playground/[id]/page.tsx`) es una conversación donde el
usuario juega el lead contra el prompt de un cliente. Hoy:

- **Una sesión congela una versión.** `demo_sessions` guarda `version_id`,
  `version_number_snapshot` y `prompt_snapshot` al crear. Para probar otra
  versión hay que crear otra sesión (por eso el equipo terminó con 3
  sesiones del mismo cliente, una por versión).
- **No hay forma de reiniciar.** Los mensajes viven en `demo_messages`
  (FK a la sesión, `ON DELETE CASCADE`). No existe "empezar de cero".
- **Las notas dependen de la sesión.** `demo_notes` referencia
  `message_ids` (jsonb) de mensajes de esa misma sesión, y solo se ven
  DESPUÉS de guardar (la tarjeta con el globo aparece al guardar la nota).
- **El bot responde con un envelope JSON**, típicamente
  `{"estado": "...", "mensajes": [...]}`. `parseTurn()`
  (`lib/adversarial-message.ts`) extrae el texto y lo une con saltos de
  línea en UN solo globo, y muestra el `estado` como pie. En n8n ese mismo
  output se parte por saltos de línea en varios mensajes de WhatsApp.

## 2. Lo que se pide (5 puntos)

1. **Cambiar la versión con la que hablo dentro de la misma sesión**, sin
   crear una sesión nueva por versión.
2. **Reiniciar la conversación para empezar de cero**, PERO las notas
   siguen visibles y guardadas aunque no sean del chat actual.
3. **Ver el globo de la respuesta referenciada desde que la selecciono**,
   no solo al guardar la nota. Botones de check (guardar) y x (cancelar)
   para confirmar la nota.
4. **Encerrar la sección de notas en su propia sección** (hoy se ve muy
   simple cuando no hay notas guardadas).
5. **Partir la respuesta del bot en globos estilo WhatsApp**: cada salto
   de línea (o cada elemento del array `mensajes`) es un globo distinto. El
   primer globo lleva la etiqueta "Bot del cliente" y el último el estado
   JSON.

## 3. La idea central: "rondas" de conversación

Los puntos 1 y 2 comparten una decisión de modelo. En vez de borrar
mensajes al reiniciar (lo que dejaría a las notas apuntando a mensajes
inexistentes), introducimos **rondas**:

- `demo_sessions` gana `current_round int not null default 1`.
- `demo_messages` gana `round int not null default 1` (y, opcional,
  `version_number_snapshot` para saber con qué versión se generó cada
  mensaje, útil al cambiar de versión a media conversación).
- **Reiniciar** = incrementar `current_round`. Los mensajes viejos NO se
  borran; el chat solo muestra los de `current_round`.
- **Las notas siguen siendo de la sesión, no de la ronda.** Por eso
  persisten visibles tras un reinicio, y como los mensajes referenciados
  nunca se borran, la vista previa del globo en la nota siempre funciona.

Ventajas frente a "borrar mensajes y snapshotear el texto en la nota":
integridad referencial intacta, los pines y el "saltar al mensaje" siguen
funcionando, y no hay que migrar el esquema de notas. El costo es que la
tabla `demo_messages` acumula rondas viejas (barato: son conversaciones de
prueba, ya se guardan indefinidamente).

Detalle de UX: una nota que referencia una ronda anterior muestra su globo
con una marca sutil ("ronda anterior") y el botón "saltar al mensaje" queda
deshabilitado (ese mensaje no está en la vista actual); el texto de la nota
y el preview del globo se siguen viendo.

## 4. Diseño por punto

### 4.1 Cambiar de versión en la sesión (punto 1)

- El header de la sesión gana un selector de versión (chip buscable, el
  mismo patrón `SearchableChip` que ya existe) con las versiones del
  cliente. Hoy el header solo muestra `version_number_snapshot` como texto.
- Al elegir otra versión: `PATCH /api/demo-sessions/[id]` actualiza
  `version_id`, `version_number_snapshot` y `prompt_snapshot` a esa
  versión. Como el `prompt_snapshot` se usa como systemPrompt en cada
  envío, el cambio afecta los turnos siguientes.
- **Decisión abierta (ver 6.1):** al cambiar de versión, ¿se inicia una
  ronda nueva (recomendado, comparación limpia) o se continúa la
  conversación con el nuevo prompt? Propongo ofrecer "cambiar y reiniciar"
  como acción principal y "solo cambiar" como secundaria.
- Un divisor visible en el chat marca el cambio ("Cambiaste a v1.5").

### 4.2 Reiniciar conversación (punto 2)

- Botón "Reiniciar" en el header (con confirmación).
- `POST /api/demo-sessions/[id]/reset` incrementa `current_round`. No borra
  nada.
- El chat pasa a estar vacío (solo muestra la ronda actual). Las notas
  siguen ahí.
- Como el reinicio ya no exige crear sesiones nuevas, esto reduce
  drásticamente el problema que motivó todo (las 3 sesiones por versión).

### 4.3 Nota en vivo con check/x (punto 3)

- Cuando seleccionas uno o más mensajes (o empiezas a escribir), aparece
  arriba de la lista de notas una **tarjeta de nota en composición** que ya
  muestra los globos de lo seleccionado (reusando el estilo de globo del
  chat, no un texto plano). Incluye el textarea y dos botones: check
  (guardar) y x (cancelar). Es puramente UI, sin cambios de esquema: los
  mensajes seleccionados existen, así que sus globos se renderizan al vuelo.
- Sustituye al composer de abajo actual: la composición sube a donde vivirá
  la nota, para que "lo que ves es lo que se guarda".

### 4.4 Sección de notas encerrada (punto 4)

- Envolver el panel de notas en una tarjeta con encabezado propio
  ("Notas"), contador, y un estado vacío más cuidado (icono + explicación),
  para que no se vea desnudo cuando no hay notas. CSS + estructura, sin
  lógica nueva.

### 4.5 Globos estilo WhatsApp (punto 5)

- Nueva función pura en `lib/adversarial-message.ts`:
  `parseTurnBubbles(content)` que devuelve
  `{ messages: string[]; state: string | null }`. Reglas:
  - Si `mensajes` es un array, cada elemento es un globo.
  - Si es un string con saltos de línea, se parte por `\n+` y se descartan
    vacíos (maneja tanto `\n` como `\n\n`).
  - Contenido no-JSON: se parte igual por saltos de línea.
- El componente `Turn` renderiza una PILA de globos:
  - El primer globo lleva la etiqueta "Bot del cliente" (o "Tú (lead)").
  - Los intermedios, solo texto.
  - El último globo del bot muestra el pie de estado JSON.
- **El tag sigue siendo a nivel de turno** (un `message_id`), no por globo
  individual: seleccionar la respuesta resalta toda su pila. Taggear globos
  sueltos exigiría subíndices en `message_ids` y complica el modelo; queda
  fuera de v1 (ver 6.2).
- Tests unitarios para `parseTurnBubbles` (array, `\n`, `\n\n`, no-JSON,
  estado presente/ausente). No se toca `parseTurn` existente (lo usa el Lab
  adversarial), se agrega la variante.

## 5. Tickets (propuesta de Sprint 8)

Uno a la vez, en orden. Los de UI pura (T4, T5) no dependen del esquema y
podrían adelantarse si se quiere ver progreso rápido.

| Ticket | Alcance | Riesgo |
|---|---|---|
| S8-T1 | Migración `012_playground_rounds.sql`: `current_round` en demo_sessions, `round` (+ opcional `version_number_snapshot`) en demo_messages. Backfill a 1. Data access filtra por ronda actual | Bajo |
| S8-T2 | Globos estilo WhatsApp: `parseTurnBubbles()` + tests, y `Turn` renderiza la pila (primer globo con etiqueta, último con estado) | Medio |
| S8-T3 | Sección de notas encerrada (punto 4): tarjeta, encabezado, estado vacío. CSS + estructura | Bajo |
| S8-T4 | Nota en vivo (punto 3): tarjeta de composición con globos de lo seleccionado + check/x, reemplaza el composer inferior | Medio |
| S8-T5 | Reiniciar conversación (punto 2): botón + confirmación + `POST .../reset`, chat filtra por ronda, notas de rondas viejas con marca | Medio |
| S8-T6 | Cambiar de versión (punto 1): selector en el header + `PATCH .../[id]`, divisor de cambio, y la decisión reiniciar-vs-continuar | Medio |
| S8-T7 | Docs: actualizar `SPEC.md` y `ARCHITECTURE.md` (sección Playground) con lo implementado | Bajo |

Sin dependencias nuevas previstas. `SearchableChip` ya existe (Sprint 7).

## 6. Decisiones abiertas (para pulir antes de codear)

1. **Al cambiar de versión, ¿reiniciar o continuar la conversación?**
   Propuesta: acción principal "cambiar y reiniciar" (comparación limpia,
   el bot no arrastra outputs de otra versión), secundaria "solo cambiar".
2. **¿Taggear globos individuales o el turno completo?** Propuesta: turno
   completo en v1 (más simple); globos sueltos como evolución futura.
3. **Modelo de reinicio: rondas (recomendado) vs borrar-y-snapshotear.**
   Propuesta: rondas, por integridad referencial y para conservar pines y
   "saltar al mensaje". Ver sección 3.
4. **¿Mostrar u ocultar rondas anteriores en el chat?** Propuesta: ocultar
   por defecto (chat = ronda actual), con opción futura de "ver historial".
5. **¿Registrar la versión por mensaje** (`version_number_snapshot` en
   demo_messages)? Propuesta: sí, es barato y hace el transcript
   autoexplicativo cuando se mezcla versión a media conversación.

## 7. Fuera de alcance de este sprint

- Taggear globos individuales (sub-índices en las notas).
- Ver/rebobinar rondas anteriores dentro del chat.
- Editar el prompt desde Playground (eso es el Editor; ya existe el
  handoff "Enviar al Editor").

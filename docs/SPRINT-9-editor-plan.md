# Plan: Sprint 9, arreglo y rediseño del Editor

> Estado: PROPUESTA. Nada implementado. Se pule antes de codear. Al aprobar,
> se ejecuta por tickets y se archiva como `docs/SPRINT-9-archive.md`.

## 1. Lo que se pide (7 problemas reportados)

1. **El "Prompt actualizado" solo guardó 40 líneas**; el resto del prompt se
   derramó al chat. El error más grave.
2. **El prompt entregado seguía llamándose "COCO IA v1.7"**; debería mostrar
   la versión destino (v1.8) para ver la diferencia. Al finalizar a versión,
   detectar que viene del Editor y NO volver a subir (evitar v1.9).
3. **Poder promover a producción desde el Editor** y que se sincronice con
   n8n automáticamente.
4. **Al actualizar, el chat se llena de texto.** En el turno de la IA solo
   debe verse: la burbuja del doc "Prompt actualizado" (con un
   "(escribiendo...)" en vivo donde hoy dice "40 líneas") y debajo la sección
   CAMBIOS REALIZADOS / SIN CAMBIOS. Nada de prompt crudo en el chat.
5. **Botón para bajar al final del chat** (evitar scrollear tanto).
6. **Un badge "(NEW)" sobre "Ver borrador"** al terminar de entregar el
   prompt, y poder promover a producción desde esa vista.
7. **La descripción de cambios se llenó con el prompt entero.** Limitar el
   change_summary: máximo 3 bullets, con tope de caracteres. No párrafos
   eternos.

## 2. Causa raíz (explica 1, 4 y 7)

El contrato del Editor (`lib/prompts/editor-persona.ts`) pide entregar el
prompt completo dentro de un único bloque de código ` ``` `. Pero los prompts
de clientes CONTIENEN bloques ` ```json ` (los ejemplos del formato de salida
del bot). Los tres extractores usan una regex **no-greedy**:

```
/```[^\n]*\n([\s\S]*?)```/     // *? = no-greedy
```

- `extractPromptFromReply` (server, `messages/route.ts`): corta en el primer
  ` ``` ` interno → guarda solo 40 líneas como `current_draft_content`. El
  draft, y por lo tanto la versión finalizada, quedan **truncados**.
- `splitPromptBlock` (cliente, `ChatMessage.tsx`): mismo corte → el card
  muestra 40 líneas y el resto del prompt se renderiza como prosa en el chat
  (`after`). Esto es el "chat se llena" del punto 4.
- `extractChangeSummary` (finalize): quita solo el primer bloque, así que
  todo lo que quedó después (medio prompt + CAMBIOS) se guarda como
  descripción. Esto es el párrafo gigante del punto 7.

Un prompt con cualquier ` ``` ` adentro rompe los tres. Arreglar la
extracción resuelve de raíz 1, 7 y buena parte de 4.

## 3. Diseño por problema

### 3.1 Extracción robusta del prompt (raíz de 1, 4, 7)

Dos enfoques; se recomienda combinarlos:

**A. Delimitador centinela (contrato nuevo, robusto).** Cambiar el persona
para envolver el prompt en un marcador que un prompt real nunca contendrá,
en vez de ` ``` `:

```
===PROMPT ACTUALIZADO===
<prompt completo, puede contener ``` adentro>
===FIN DEL PROMPT===

**CAMBIOS REALIZADOS:**
- ...
```

La extracción busca el texto entre `===PROMPT ACTUALIZADO===` y
`===FIN DEL PROMPT===`. Inmune a los ` ``` ` internos. Opus sigue este tipo
de contrato de salida con alta fiabilidad.

**B. Fallback greedy para lo viejo.** Para sesiones/mensajes que ya usaron
` ``` `, el extractor cae a una regex **greedy** (`([\s\S]*)`, sin `?`) que
captura desde el primer ` ``` ` hasta el ÚLTIMO, es decir el bloque exterior
completo con sus fences internos. Esto por sí solo ya arregla el formato
actual (el último ` ``` ` es el cierre exterior, antes de CAMBIOS).

Los cuatro puntos a tocar, de forma consistente server + cliente:
`extractPromptFromReply`, `splitPromptBlock`, `extractChangeSummary`,
`hasUnclosedFence`, más el scan de finalize. Tests nuevos en
`editor-persona.test.ts` con un prompt que contiene ` ```json ` adentro (la
forma exacta del reporte).

Decisión abierta 6.1: ¿centinela + fallback (recomendado) o solo greedy
(cambio mínimo, menos robusto)?

### 3.2 Número de versión visible en el Editor (punto 2)

Hoy el persona tiene PROHIBIDO tocar versiones (el Studio versiona). El draft
guardado conserva el título "v1.7" hasta finalizar, cuando `createVersion`
hace el minor bump y `syncVersionMarkers` reescribe el título a v1.8.

Cambio: al guardar el draft (tras extraer el prompt del turno), aplicar
`syncVersionMarkers(prompt, siguienteNumero)` donde
`siguienteNumero = computeNextNumber(ultimaVersion, "minor")`. Así el Editor
muestra v1.8 desde el primer turno y el usuario ve la diferencia.

Sobre el doble bump: no ocurre. Finalizar calcula el número desde la última
versión en la DB (sigue siendo v1.7 hasta finalizar), así que produce v1.8;
sincronizar el título del draft a v1.8 no cambia la última versión en DB. Se
documenta explícitamente para despejar la duda.

### 3.3 UX del turno de la IA (punto 4)

Con 3.1 arreglado, el prompt ya no se derrama. Encima:

- Mostrar el card "Prompt actualizado" en cuanto empieza a escribirse el
  bloque, con "(escribiendo...)" en el lugar del contador de líneas; al
  cerrar el bloque, cambiar a "N líneas".
- Debajo del card, la sección CAMBIOS REALIZADOS / SIN CAMBIOS (el texto
  `after`), que puede seguir llegando en streaming.
- El prompt crudo nunca se renderiza como prosa en el chat.

### 3.4 Descripción de cambios acotada (punto 7)

- Persona: pedir EXACTAMENTE 3 bullets concisos en CAMBIOS REALIZADOS (uno
  por: qué sección, qué se hizo, qué NO se tocó), sin párrafos.
- `extractChangeSummary`: recortar a los primeros 3 bullets y a un tope de
  caracteres (p. ej. 400). El schema baja su max (hoy 4000) acorde.
- La Library ya muestra el summary por versión; acotarlo mantiene los cards
  chicos. Este cambio, sumado a 3.1, elimina el párrafo gigante.

### 3.5 Promover desde el Editor + sync n8n (puntos 3 y 6)

Promover opera sobre una VERSIÓN (marca `is_production`), y en el Editor solo
hay draft hasta finalizar. Flujo propuesto:

1. "Finalizar edición" crea la versión (v1.8), como hoy.
2. Tras finalizar, aparece "Promover a producción" (en el topbar y/o dentro
   del drawer "Ver borrador"). Reutiliza el flujo del Sprint 7: marca
   producción y, si el cliente tiene bindings API, abre `N8nSyncModal` con el
   diff; los destinos manuales quedan pendientes.
3. La versión creada y el `client_id` ya vienen del finalize, así que el
   modal de sync se puede abrir sin recargar.

Decisión abierta 6.2: ¿acción separada "Promover" tras finalizar, o un botón
combinado "Finalizar y promover"? Propuesta: separada (finalizar y promover
son decisiones distintas), con la promoción disponible desde el drawer.

### 3.6 Badge "(NEW)" en Ver Borrador (punto 6)

- Cuando un turno produce un draft nuevo (se actualizó `current_draft_content`)
  y el usuario aún no ha abierto el drawer desde entonces, mostrar un badge
  "NEW" sobre el botón "Ver borrador".
- Se limpia al abrir el drawer. Estado local en `SessionChat` (marca de
  "draft cambió desde la última apertura").
- Dentro del drawer, además del contenido, los botones Finalizar y (tras
  finalizar) Promover.

### 3.7 Botón bajar al final del chat (punto 5)

- Botón flotante "bajar" en `chat-stream` que aparece cuando el scroll no
  está al fondo; al hacer clic, scroll suave al final. Estado por listener de
  scroll (umbral de distancia al fondo). UI pura.

## 4. Tickets (propuesta de Sprint 9)

Uno a la vez, en orden. T1 es el crítico y desbloquea el resto.

| Ticket | Alcance | Riesgo |
|---|---|---|
| S9-T1 | Extracción robusta: contrato centinela en el persona + `extractPromptFromReply` / `splitPromptBlock` / `extractChangeSummary` / `hasUnclosedFence` con fallback greedy + tests con prompt que contiene ` ```json ` | Alto |
| S9-T2 | Número de versión destino visible: `syncVersionMarkers` al guardar el draft; confirmar no-doble-bump | Medio |
| S9-T3 | Descripción acotada: persona a 3 bullets + tope en `extractChangeSummary` + max del schema | Bajo |
| S9-T4 | UX del turno IA: card en estado "escribiendo..." mientras strea, luego líneas; CAMBIOS debajo; nunca prompt crudo | Medio |
| S9-T5 | Badge "NEW" en Ver Borrador + botones Finalizar/Promover dentro del drawer | Medio |
| S9-T6 | Promover desde el Editor tras finalizar + apertura de `N8nSyncModal` (reusa Sprint 7) | Medio |
| S9-T7 | Botón "bajar al final" en el chat | Bajo |
| S9-T8 | Docs: `ARCHITECTURE.md` (contrato de salida del Editor) y `SPEC.md` (Editor) | Bajo |

Sin dependencias nuevas. Reutiliza `N8nSyncModal`, `syncVersionMarkers`,
`computeNextNumber`, el flujo de promote del Sprint 7.

## 5. Riesgo y prueba

El T1 cambia el contrato de salida del modelo, así que hay que probarlo
contra un prompt real que contenga ` ```json ` (el de Coco). No puedo drivear
el Editor en este entorno (necesita Supabase + claves LLM), así que la
validación será: tests unitarios con la forma exacta del reporte, typecheck,
build, y prueba manual tuya con Coco. El fallback greedy protege las sesiones
viejas que ya usaron ` ``` `.

## 6. Decisiones abiertas

1. **Extracción: centinela + fallback (recomendado) vs solo greedy.** El
   centinela es lo robusto; el greedy es el cambio mínimo. Propuesta:
   centinela con fallback greedy para lo viejo.
2. **Promover: acción separada tras finalizar vs botón combinado.**
   Propuesta: separada, disponible también desde el drawer.
3. **Tope exacto del change_summary:** 3 bullets + ¿cuántos caracteres? (400
   propuesto). Confirmar.
4. **¿El badge "NEW" se limpia solo al abrir el drawer, o también al
   finalizar?** Propuesta: al abrir el drawer.

## 7. Fuera de alcance

- Rehacer el modelo de versionado (solo se ajusta el momento del sync de
  markers).
- Editor multi-prompt o comparación visual de diffs lado a lado (posible
  evolución futura).

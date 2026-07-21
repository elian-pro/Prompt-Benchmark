# Plan: sincronización de prompts con n8n ("Promover" actualiza el nodo)

> Estado: PROPUESTA, revisión 5. Nada de esto está implementado. Este
> documento existe para pulirse antes de escribir código. Cuando se
> apruebe, se convertirá en el Sprint 7 y las decisiones finales se
> integrarán a `docs/ARCHITECTURE.md` y `docs/SPEC.md`.

## 1. Objetivo

Hoy el flujo termina en un paso manual: el usuario copia el prompt al
portapapeles y lo pega en el nodo de n8n. La meta:

- Para flujos alojados en **n8n con acceso** (el de Zebra, o el de un
  cliente que comparta credenciales): al presionar **"Promover a
  producción"**, el Studio escribe el prompt directamente en el nodo.
- Para flujos alojados en **n8n de clientes sin acceso**: el update sigue
  siendo manual (copiar y pegar), pero el Studio lleva el registro de qué
  versión está desplegada y avisa cuando producción cambió y el nodo del
  cliente todavía no.

El Studio pasa de ser "el lugar donde se edita" a ser la **fuente de
verdad** del prompt. n8n es el destino de despliegue: a veces alcanzable
por API, a veces no.

Fuera de alcance (por ahora): crear o modificar flujos de n8n más allá del
system prompt del nodo vinculado, activar/desactivar workflows, y
sincronizar en sentido n8n → Studio de forma automática (eso sigue siendo
"Importar").

## 2. Premisas estructurales (confirmadas por el equipo)

1. **Todos los prompts de clientes viven en nodos AI Agent**
   (`@n8n/n8n-nodes-langchain.agent`). El prompt es siempre el campo
   `parameters.options.systemMessage`. El Studio no necesita soportar
   otros tipos de nodo en v1.
2. **Un workflow puede tener VARIOS nodos AI Agent.** El Studio nunca
   adivina cuál es el correcto: el usuario selecciona manualmente el
   flujo Y el nodo, idealmente al dar de alta al cliente (sección 8.3).
3. **No todos los flujos viven en el n8n de Zebra.** Muchos están en la
   instancia n8n del propio cliente, sin credenciales para el Studio.
   Esos destinos existen igual en el sistema, pero en **modo manual**:
   sin push, sin drift check, con confirmación humana de despliegue.

## 3. Los dos modos de despliegue

Cada vínculo cliente ↔ destino n8n (un "binding") tiene un modo:

| | **Modo API** | **Modo manual** |
|---|---|---|
| Dónde vive el flujo | n8n de Zebra, o n8n de cliente que compartió API key | n8n del cliente, sin acceso |
| Qué guarda el binding | Conexión + workflow + nodo AI Agent concretos | Una etiqueta descriptiva ("n8n de Kuyabeh, flujo WhatsApp") |
| Al promover | El Studio empuja el prompt vía API (con diff y confirmación) | El Studio ofrece copiar al portapapeles y el usuario confirma "ya lo pegué" |
| Qué versión está desplegada | Verificable: hash del texto en el nodo | Declarada: la última que el usuario confirmó |
| Drift | Detectable (comparación real contra n8n) | No detectable; el estado es de confianza |
| Recordatorio pendiente | Automático si el push falló | Automático si producción avanzó y no se ha confirmado el pegado |

La pieza más valiosa del modo manual es el **estado "pendiente de
actualizar"**: hoy, cuando promueves una versión, nada te recuerda qué
nodos de clientes siguen corriendo la anterior. Con esto, el client detail
(y la tarjeta en la Library) muestran "Producción es v3.3, el n8n del
cliente sigue en v3.2 confirmada el 2 jul" hasta que confirmes el pegado.

Un cliente puede mezclar modos (un flujo en tu n8n y otro en el suyo). Y
si un cliente algún día comparte su API key, su instancia se agrega como
una conexión más y sus bindings manuales se pueden convertir a modo API.

## 4. Contexto verificado en la app

- "Promover a producción" es `POST /api/versions/[id]/promote` →
  `promoteToProduction()` en `lib/db/versions.ts`. Solo mueve el tag
  `is_production` entre versiones del cliente, no crea versión nueva.
  Este es el punto de enganche natural para el push y los recordatorios.
- Cada prompt lleva una línea `Versión: X.Y` que `syncVersionLine()`
  mantiene sincronizada con `version_number`. Fue diseñada justo para
  identificar la versión de un prompt viviendo en n8n. En modo API sirve
  para verificación y drift; en modo manual le sirve al humano para ver
  en el nodo del cliente qué versión quedó pegada.
- El import desde n8n ya existe (`bump_type: 'imported'`, marca
  `is_legacy`). El vínculo cliente ↔ nodo hoy solo existe en la cabeza
  del equipo; este plan lo vuelve dato.
- Los secretos ya tienen patrón establecido: cifrado AES-256-GCM en
  `lib/crypto.ts`, almacenados en DB (como `providers`), usados solo
  server-side desde API routes. Las API keys de n8n siguen ese patrón.
- El n8n propio de Zebra es self-hosted en EasyPanel
  (`https://n8n-n8n.9qd6cz.easypanel.host`), misma infra que la app. Será
  la primera conexión configurada.

## 5. Decisión de arquitectura: push vs pull (solo aplica al modo API)

| | **Opción A: Push (recomendada)** | Opción B: Pull en runtime |
|---|---|---|
| Cómo funciona | Al promover, el Studio escribe el systemMessage del nodo vinculado vía API REST de n8n | Cada workflow arranca pidiendo el prompt de producción al Studio (o a Supabase) |
| Cambios en n8n | Ninguno | Editar todos los flujos una vez para agregar el fetch |
| Dependencia en runtime | n8n sigue autocontenido; si el Studio se cae, producción no se entera | Si el Studio o Supabase se caen, los bots de los clientes fallan |
| Flujos en n8n de clientes | Mismo modelo (modo manual cuando no hay acceso) | Inviable: no vas a apuntar el flujo de un cliente a tu tool interno |
| Drift posible | Sí, se detecta (sección 8.6) | No, imposible por diseño |
| Riesgo principal | El PUT de n8n reemplaza el workflow completo (sección 7.2) | Acoplar producción de clientes a un tool interno |

**Recomendación: Opción A (push).** Además de los argumentos de siempre
(no meter dependencia en runtime a flujos que atienden leads reales), el
contexto multi-instancia la vuelve la única opción coherente: el pull ni
siquiera es planteable en el n8n de un cliente.

## 6. Arquitectura propuesta

```
Library (alta de cliente o client detail)
  │
  │  vincular destino:
  │    modo API:    conexión → workflow → nodo AI Agent → confirmar
  │    modo manual: etiqueta descriptiva ("n8n de Kuyabeh, flujo X")
  │
  │  "Promover a producción" (cliente con bindings)
  ▼
POST /api/versions/[id]/promote      ──► marca is_production (igual que hoy)
  │
  ├── bindings modo API ──► lib/n8n/sync.ts
  │     1. GET workflow completo (API de la conexión del binding)
  │     2. localiza el nodo por node_id (fallback: node_name; si no: error)
  │     3. verifica que siga siendo un AI Agent
  │     4. lee parameters.options.systemMessage actual
  │     5. guarda snapshot del texto anterior (rollback)
  │     6. reemplaza SOLO ese string en el JSON
  │     7. PUT workflow completo de vuelta
  │     8. registra el evento en n8n_sync_events
  │
  └── bindings modo manual ──► quedan "Pendiente de actualizar";
        el modal ofrece copiar al portapapeles y el botón
        "Marcar como actualizado" registra la confirmación
```

Componentes nuevos:

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Conexiones n8n | Settings + tabla `n8n_connections` | N instancias: nombre, URL base, API key cifrada, "Probar conexión" |
| Bindings | Tabla `n8n_bindings` + UI en alta de cliente y client detail | Destinos de despliegue por cliente, modo API o manual |
| Cliente REST | `lib/n8n/client.ts` | `listWorkflows()`, `getWorkflow(id)`, `updateWorkflow(id, body)` contra la conexión que se le pase; timeouts y errores en español |
| Acceso al nodo | `lib/n8n/agent-node.ts` | Listar los AI Agent de un workflow, localizar el vinculado, leer y escribir su `systemMessage` respetando expresiones |
| Motor de sync | `lib/n8n/sync.ts` | Orquestar push, drift check, rollback, y el estado pendiente de los manuales |
| Bitácora | Tabla `n8n_sync_events` | Auditoría de pushes, confirmaciones manuales y rollbacks; snapshots para revertir |

Todo server-side (regla 5 de CLAUDE.md). El navegador solo habla con
`/api/...` del Studio; jamás ve una API key de n8n.

## 7. Modelo de datos (nueva migración `011_n8n_sync.sql`)

`001_initial.sql` no se toca. Tres tablas nuevas:

```sql
-- Instancias de n8n alcanzables por API. La de Zebra es la primera;
-- si un cliente comparte credenciales, la suya se agrega como otra fila.
create table n8n_connections (
  id uuid primary key default uuid_generate_v4(),
  name text not null,                     -- "Zebra", "Kuyabeh (cliente)"
  base_url text not null,
  api_key_encrypted text not null,        -- mismo formato que providers
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Destino de despliegue de un cliente. Modo 'api': conexión + workflow +
-- nodo concretos. Modo 'manual': solo una etiqueta; el update lo hace un
-- humano y aquí se registra qué versión confirmó.
create table n8n_bindings (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  mode text not null check (mode in ('api', 'manual')),

  -- modo api (null en manual)
  connection_id uuid references n8n_connections(id) on delete restrict,
  workflow_id text,                       -- id de n8n
  workflow_name text,                     -- cache para mostrar en UI
  node_id text,                           -- id interno del nodo en n8n
  node_name text,                         -- cache para UI y fallback
  expression_prefix boolean not null default false,  -- el systemMessage
                                          -- original traía "=" (expresión)
  last_pushed_hash text,                  -- sha256 del texto empujado (drift)

  -- modo manual (null en api)
  manual_label text,                      -- "n8n de Kuyabeh, flujo WhatsApp"

  -- comunes
  sync_enabled boolean not null default true,
  last_deployed_version_id uuid references versions(id) on delete set null,
  last_deployed_at timestamptz,
  created_at timestamptz not null default now(),

  check (
    (mode = 'api' and connection_id is not null and workflow_id is not null
      and node_id is not null and manual_label is null)
    or
    (mode = 'manual' and manual_label is not null and connection_id is null
      and workflow_id is null and node_id is null)
  )
);

create unique index unique_api_binding
  on n8n_bindings (client_id, connection_id, workflow_id, node_id)
  where mode = 'api';

-- Bitácora. En modo api también es el mecanismo de rollback:
-- previous_content guarda lo que había en el nodo antes de sobreescribir.
create table n8n_sync_events (
  id uuid primary key default uuid_generate_v4(),
  binding_id uuid references n8n_bindings(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  version_id uuid references versions(id) on delete set null,
  action text not null check (action in
    ('push', 'rollback', 'drift_detected', 'manual_confirm')),
  status text not null check (status in ('success', 'error')),
  previous_content text,
  pushed_content text,
  error_message text,
  created_at timestamptz not null default now()
);
```

Notas:
- `last_deployed_version_id` es el corazón del estado unificado: en modo
  API lo escribe el push exitoso; en modo manual lo escribe el botón
  "Marcar como actualizado". El recordatorio "pendiente" es simplemente
  `last_deployed_version_id != versión de producción actual`.
- El historial de workflows de n8n es feature enterprise; por eso el
  snapshot para rollback vive de nuestro lado (`previous_content`).
- `connection_id` usa `on delete restrict`: no se puede borrar una
  conexión con bindings vivos (primero convertirlos a manual o
  desvincular).
- RLS permisivo `to authenticated`, como el resto del esquema.

## 8. Flujos de usuario (UI en español)

### 8.1 Conectar instancias de n8n (Settings)

Settings → nueva sección "Conexiones n8n": lista de conexiones (nombre,
URL, key enmascarada `••••` + últimos 4, "Probar conexión", eliminar), y
"Agregar conexión". La primera será la de Zebra; las de clientes que
compartan credenciales se agregan igual.

### 8.2 La API de n8n (modo API)

| Uso | Endpoint |
|---|---|
| Listar workflows para el picker | `GET /api/v1/workflows?limit=100` |
| Leer un workflow completo (picker de nodos, push, drift) | `GET /api/v1/workflows/{id}` |
| Escribir el prompt | `PUT /api/v1/workflows/{id}` |
| Probar conexión | `GET /api/v1/workflows?limit=1` |

Autenticación: header `X-N8N-API-KEY`, generada en cada instancia en
Settings → n8n API. n8n recarga los workflows activos al recibir el PUT:
el cambio queda vivo de inmediato.

Trampas conocidas y mitigaciones (sin cambios desde la revisión 2, ahora
aplicadas por conexión):

- **El PUT es de reemplazo total.** Mitigación en `lib/n8n/sync.ts`:
  leer-modificar-escribir atómico y corto (GET fresco, mutar solo el
  string, PUT inmediato); detección de edición concurrente comparando
  `versionId`/`updatedAt` capturado al mostrar el diff; sanitizar el body
  (la API rechaza campos read-only como `id`, `active`, `tags`);
  snapshot previo siempre en la bitácora.
- **Expresiones.** Un string que empieza con `=` es expresión y los
  `{{ ... }}` se interpolan en runtime. Se preserva el prefijo original
  (`expression_prefix`); si el texto actual del nodo trae `{{ }}` y el
  prompt nuevo no, se bloquea con advertencia (romperías la inyección de
  datos del lead); si el prompt nuevo trae `{{ }}` literales y el campo
  lleva `=`, también se advierte. Tests unitarios propios.
- **Localización del nodo.** `listAgentNodes(workflow)` alimenta el
  picker; `findBoundNode(workflow, binding)` busca por `node_id`, cae a
  `node_name` (flujo reconstruido) pidiendo re-confirmación, y aborta con
  error claro si no aparece o si el nodo ya no es un AI Agent.

### 8.3 Vincular al dar de alta al cliente (el camino feliz)

El modal de nuevo cliente gana un paso opcional "Despliegue en n8n":

1. Elegir tipo de destino:
   - **"En un n8n conectado"**: elegir conexión → buscador de workflows →
     lista de los nodos AI Agent de ese flujo (nombre + preview de las
     primeras líneas de su systemMessage, porque puede haber varios) →
     marcar el correcto.
   - **"En el n8n del cliente (sin acceso)"**: escribir la etiqueta
     descriptiva, por ejemplo "n8n de Kuyabeh, flujo WhatsApp".
2. Se pueden agregar varios destinos de cualquier mezcla de modos antes
   de guardar.
3. El paso es saltable: un cliente puede nacer sin destinos y vincularse
   después.

Aplica igual al flujo de "Importar prompt existente", donde es todavía
más natural (el prompt viene justamente de un nodo de n8n).

### 8.4 Vincular o ajustar después (client detail)

Tarjeta "Despliegue n8n" en el client detail: lista de destinos con su
modo y estado, mismo picker para agregar, desvincular por destino, y
convertir un destino manual a modo API si la instancia de ese cliente se
conectó después (elige workflow y nodo, hereda el historial). Advertencias
suaves al vincular en modo API: si el texto del nodo no se parece al
prompt de producción (ni comparte la línea `Versión: X.Y`), o si el nodo
ya está vinculado a otro cliente, se avisa.

### 8.5 Promover con sincronización

1. Usuario presiona "Promover a producción" en un cliente con destinos.
2. Modal de confirmación con dos bloques:
   - **Destinos API**: por cada uno, el diff entre lo que hay en n8n
     ahora mismo y lo que se va a empujar.
   - **Destinos manuales**: recordatorio de que quedarán pendientes,
     con botón "Copiar prompt" ahí mismo.
3. Al confirmar: primero se marca `is_production` en DB (como hoy),
   luego se empujan los destinos API uno por uno.
4. Si un push falla, la promoción NO se revierte (la verdad del Studio ya
   cambió); ese destino queda "Pendiente" con "Reintentar".
5. Los destinos manuales quedan "Pendiente de actualizar" hasta que el
   usuario presione "Marcar como actualizado" (registra versión, fecha y
   evento `manual_confirm`). El botón vive en el modal y en el client
   detail.
6. Clientes sin destinos: el flujo actual no cambia en nada. Copiar al
   portapapeles sigue existiendo siempre, también como plan B.

### 8.6 Estados por destino

Badge calculado al abrir el client detail:

| Estado | Modo | Significado |
|---|---|---|
| **Sincronizado** | API | El nodo tiene exactamente lo último empujado (hash coincide) |
| **Desincronizado** | API | Alguien editó el nodo a mano después del último push. Acciones: "Ver diff", "Empujar producción", "Importar desde n8n" |
| **Pendiente** | API | El último push falló. Acción: "Reintentar" |
| **Nodo no encontrado** | API | El flujo cambió y el nodo vinculado ya no existe. Acción: "Volver a vincular" |
| **Sin verificar** | API | La instancia no respondió (no bloquea, solo informa) |
| **Actualizado (declarado)** | manual | La versión confirmada coincide con producción |
| **Pendiente de actualizar** | manual | Producción avanzó y no se ha confirmado el pegado. Acciones: "Copiar prompt", "Marcar como actualizado" |

El recordatorio de manuales pendientes también se asoma en la tarjeta del
cliente en la grid de la Library, para que no dependa de abrir el detail.

Historial "Sincronizaciones" (de `n8n_sync_events`) en el client detail,
con "Revertir" en cada push API exitoso.

## 9. Seguridad

- Una API key de n8n puede reescribir TODOS los workflows de su
  instancia, no solo prompts. Y ahora puede haber keys de instancias de
  clientes: mayor responsabilidad. Tratamiento: cifradas con
  `lib/crypto.ts` (AES-256-GCM, mismo formato que providers), solo
  descifradas dentro de API routes, jamás en el cliente, jamás en logs.
  Sin cambios a `.env` (viven en DB). Rotar en la instancia de origen si
  se sospecha fuga.
- El motor de sync solo ejecuta `GET workflow` y `PUT workflow`; no
  expone ejecución ni borrado, aunque la key lo permita.
- App y n8n de Zebra corren en el mismo EasyPanel: evaluar hostname
  interno para ese tráfico (optimización, no bloqueante). Las instancias
  de clientes siempre van por HTTPS público.
- Los `n8n_sync_events` guardan prompts completos (contenido sensible de
  clientes): mismas garantías que la tabla `versions`.

## 10. Plan de implementación (propuesta de Sprint 7)

**Prioridad de entrega (decidida):** hoy la mayoría de los clientes viven
en el n8n propio de Zebra, así que el **modo API es el valor principal de
v1** y se entrega primero. El modo manual y el multi-instancia NO se
posponen a otro sprint: el modelo de datos (sección 7) ya los contempla
desde la primera migración, para no rehacer nada cuando lleguen clientes
en sus propias instancias. Lo que se secuencia es la UI, no el esquema.

Esto se traduce en dos fases dentro del mismo sprint:

**Fase A: modo API contra el n8n de Zebra (el 80% del valor hoy).**

| Ticket | Alcance | Riesgo |
|---|---|---|
| S7-T1 | Migración `011_n8n_sync.sql` completa (las 3 tablas, con `mode`, `n8n_connections` en plural y todos los campos manuales ya incluidos aunque la UI aún no los use) + índices + RLS | Bajo |
| S7-T2 | `lib/n8n/client.ts` (REST por conexión) + `lib/n8n/agent-node.ts` (listar agentes, localizar nodo con fallback, systemMessage, `=` y `{{ }}`) + tests | Medio |
| S7-T3 | Settings: sección "Conexiones n8n" (CRUD + probar conexión), diseñada multi-instancia desde el día uno aunque se cargue una sola | Bajo |
| S7-T4 | Picker de vinculación modo API (conexión → workflow → nodo AI Agent con preview) como componente reutilizable + `/api/clients/[id]/n8n-bindings` + tarjeta "Despliegue n8n" en client detail | Medio |
| S7-T5 | Integrar el picker al alta de cliente y al import (paso opcional "Despliegue en n8n") | Bajo |
| S7-T6 | Motor `lib/n8n/sync.ts` + hook en promote + modal de diff + estados sincronizado/desincronizado/pendiente/reintentar + drift badge + historial + revertir | Alto |

Al cerrar la fase A ya tienes lo que pediste originalmente: promover
actualiza el nodo en tu n8n, con confirmación y drift.

**Fase B: preparación para clientes en sus propias instancias.**

| Ticket | Alcance | Riesgo |
|---|---|---|
| S7-T7 | Variante manual del binding: destino con etiqueta, "Marcar como actualizado", estado "Pendiente de actualizar", copiar prompt desde el modal de promoción, indicador de pendientes en la grid de la Library. Agregar segunda conexión (API key de un cliente) ya funciona sin código nuevo porque Settings es multi-instancia | Medio |
| S7-T8 | Convertir un destino manual a modo API cuando un cliente comparte credenciales (hereda historial) + "Nodo no encontrado" + re-vincular | Bajo |
| S7-T9 | Docs: actualizar `ARCHITECTURE.md` y `SPEC.md` en inglés con lo implementado | Bajo |

Sin dependencias nuevas previstas: fetch nativo para la API de n8n, crypto
ya existe, diff ya existe en `lib/version-utils.ts`.

Prerequisito humano antes de S7-T3: generar la API key del n8n de Zebra
(Settings → n8n API). Las de clientes, cuando y si las compartan.

Por qué la migración va completa en T1 y no por fases: cambiar el esquema
después obligaría a un `012_*.sql` que añada `mode` y las columnas
manuales a una tabla ya poblada, con backfill. Meter todo desde el inicio
cuesta lo mismo hoy y evita esa cirugía. La regla del repo (no tocar
`001_initial.sql`, una migración nueva por cambio) se respeta igual.

## 11. Decisiones abiertas (para pulir antes de codear)

1. ~~¿Sprint completo o manual primero?~~ **Decidido:** modo API primero
   (fase A), modo manual y multi-instancia después (fase B), todo en el
   mismo sprint y sobre la misma migración. Ver sección 10.
2. **¿Push automático o con confirmación?** Este plan propone SIEMPRE
   mostrar el diff y confirmar (es producción de clientes reales). Se
   puede agregar un toggle "empujar sin preguntar" por binding después.
3. **¿Promover sigue funcionando si una instancia está caída?**
   Propuesta: sí, la promoción procede y el destino queda "Pendiente".
   Alternativa más estricta: bloquear la promoción. Decidir.
4. **¿Un binding puede apuntar a un workflow inactivo o de staging?**
   Propuesta: sí, sin distinción especial en v1.
5. **¿Adelantar la auto-vinculación en el import?** Barata si el picker
   ya existe; decidir si entra en S7-T5 o después.
6. Nombres en UI: "Despliegue n8n", "Producción n8n", "Destinos". Y el
   texto del botón de confirmación manual: "Marcar como actualizado",
   "Ya lo pegué", "Confirmar despliegue".

## 12. Evolución futura (fuera de este plan)

Este plan ya deja el terreno listo para el crecimiento previsible; lo de
aquí abajo es lo que queda más allá del horizonte del Sprint 7:

- **Onboarding de instancia de cliente en un paso**: hoy agregar la
  conexión de un cliente es cargar su URL y API key en Settings (ya
  soportado). Un futuro asistente podría además descubrir sus workflows y
  sugerir bindings automáticamente. Barato encima de lo que ya existe.
- **Salud de conexiones**: un panel que pinga cada instancia y avisa si
  la API key de un cliente fue revocada o la URL cambió, antes de que
  falle un push.
- **Opción B (pull en runtime)** para drift cero en el n8n propio, si
  algún día se acepta la dependencia. No aplica a instancias de clientes.
- **Webhook de n8n → Studio** al editar un workflow, para detectar drift
  en tiempo real en lugar de al abrir la página. Requiere acceso a la
  instancia, así que primero para el n8n propio.
- **Recordatorios activos de manuales pendientes**: resumen al entrar a
  la app, o aviso a Google Chat como ya hacen los flujos internos de
  Zebra. Cobra más sentido conforme crezcan los clientes en sus propias
  instancias.
- **Soporte de otros tipos de nodo** (Chain LLM, OpenAI message) si algún
  prompt dejara de vivir en un AI Agent. El registro de acceso al nodo
  (`agent-node.ts`) es el único punto a extender.
- **Roles y permisos por conexión** si algún día más gente del equipo usa
  el Studio y no todos deben poder escribir en el n8n de todos los
  clientes. Hoy no aplica (2 usuarios, un workspace compartido).

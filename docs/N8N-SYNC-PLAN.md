# Plan: sincronización de prompts con n8n ("Promover" actualiza el nodo)

> Estado: PROPUESTA. Nada de esto está implementado. Este documento existe
> para pulirse y discutirse antes de escribir código. Cuando se apruebe, se
> convertirá en el Sprint 7 y las decisiones finales se integrarán a
> `docs/ARCHITECTURE.md` y `docs/SPEC.md`.

## 1. Objetivo

Hoy el flujo termina en un paso manual: el usuario copia el prompt al
portapapeles y lo pega en el nodo de n8n. La meta es que al presionar
**"Promover a producción"** en la Library, el Studio también escriba ese
prompt directamente en el nodo de n8n donde vive en producción.

El Studio pasa de ser "el lugar donde se edita" a ser la **fuente de verdad**
del prompt, y n8n pasa a ser un destino de despliegue.

Fuera de alcance (por ahora): crear o modificar flujos de n8n más allá del
texto del prompt, activar/desactivar workflows, sincronizar en sentido
n8n → Studio de forma automática (eso sigue siendo el flujo de "Importar").

## 2. Contexto verificado (no supuesto)

### 2.1 En la app

- "Promover a producción" es `POST /api/versions/[id]/promote` →
  `promoteToProduction()` en `lib/db/versions.ts`. Solo mueve el tag
  `is_production` entre versiones del cliente. No crea versión nueva.
  Este es el punto de enganche natural para el push a n8n.
- Cada prompt lleva una línea `Versión: X.Y` que `syncVersionLine()`
  mantiene sincronizada con `version_number`. Esto ya fue diseñado para
  poder identificar la versión de un prompt viviendo en n8n. Nos sirve
  para verificar y detectar drift.
- El import desde n8n ya existe (`bump_type: 'imported'`, marca
  `is_legacy` en el cliente). El vínculo cliente ↔ workflow hoy solo
  existe en la cabeza del equipo; este plan lo vuelve dato.
- Los secretos ya tienen un patrón establecido: cifrado AES-256-GCM en
  `lib/crypto.ts`, almacenados en DB (tabla `providers`), usados solo
  server-side desde API routes. La credencial de n8n seguirá exactamente
  ese patrón.

### 2.2 En la instancia de n8n (inspeccionada en vivo)

- Instancia self-hosted en EasyPanel: `https://n8n-n8n.9qd6cz.easypanel.host`
  (mismo proveedor de infra que la app, lo cual simplifica red y latencia).
- Los prompts de cliente NO viven en un solo tipo de nodo. Ejemplos reales:
  - `Sofía flujo Comentarios&DM´s` (id `XwWC0INCwg6l3ESy`): el prompt es
    el mensaje con `role: "system"` dentro de
    `parameters.messages.values[]` de un nodo
    `@n8n/n8n-nodes-langchain.openAi` ("Message a model1").
  - `Meta Ads Zebra Kuyabeh` (id `0hhTOO0aUIjEexGD`): usa un nodo
    `@n8n/n8n-nodes-langchain.agent` (AI Agent), donde el prompt vive en
    `parameters.options.systemMessage`.
- Detalle crítico encontrado: el system message de Sofía empieza con `=`.
  En n8n un parámetro string que empieza con `=` es una **expresión**
  (puede contener `{{ ... }}` que n8n evalúa en runtime). El motor de
  sincronización tiene que respetar esto (ver sección 6.3).
- El conector MCP de n8n disponible en Claude solo permite buscar, leer y
  ejecutar workflows. **No permite actualizarlos.** Por eso la app usará
  la **API pública REST de n8n** directamente, con su propia API key.

## 3. Decisión de arquitectura: push vs pull

Hay dos formas de lograr "lo que está en producción en el Studio es lo que
corre en n8n":

| | **Opción A: Push (recomendada)** | Opción B: Pull en runtime |
|---|---|---|
| Cómo funciona | Al promover, el Studio escribe el prompt dentro del JSON del workflow vía API REST de n8n | Cada workflow arranca con un nodo HTTP que pide el prompt de producción al Studio (o a Supabase) |
| Cambios en n8n | Ninguno en la estructura de los flujos | Hay que editar todos los flujos una vez y agregar el fetch |
| Dependencia en runtime | n8n sigue autocontenido; si el Studio se cae, producción no se entera | Si el Studio o Supabase se caen, los bots de los clientes fallan |
| Latencia por ejecución | Cero | Una llamada HTTP extra por ejecución (cacheable, pero es complejidad) |
| Drift posible | Sí, si alguien edita el nodo a mano (se detecta, ver sección 7) | No, imposible por diseño |
| Riesgo principal | El PUT reemplaza el workflow completo (ver sección 6.2) | Acoplar producción de clientes a un tool interno |

**Recomendación: Opción A (push).** Los flujos de n8n atienden leads de
clientes reales; meterles una dependencia en runtime hacia una herramienta
interna es un riesgo desproporcionado. El push mantiene a n8n exactamente
como está hoy, solo automatiza el "copiar y pegar". La opción B queda
documentada como evolución futura si algún día se quiere drift cero.

## 4. Arquitectura propuesta (opción A)

```
Library (client detail)
  │
  │  "Promover a producción" (con binding activo)
  ▼
POST /api/versions/[id]/promote        ──► marca is_production (igual que hoy)
  │                                        y si hay bindings:
  ▼
lib/n8n/sync.ts  (motor de sincronización)
  │  1. lee el binding (workflow, nodo, campo)
  │  2. GET workflow completo a la API de n8n
  │  3. localiza el nodo, extrae el prompt actual (extractor por tipo de nodo)
  │  4. guarda snapshot del texto anterior (para rollback)
  │  5. reemplaza SOLO el string del prompt en el JSON
  │  6. PUT workflow completo de vuelta
  │  7. registra el evento en n8n_sync_events
  ▼
n8n REST API  (X-N8N-API-KEY, cifrada en DB con lib/crypto.ts)
```

Componentes nuevos:

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Conexión n8n | Settings + tabla `integration_settings` | URL base + API key cifrada + botón "Probar conexión" |
| Bindings | Tabla `n8n_bindings` + UI en client detail | Vincular un cliente con uno o más nodos concretos de n8n |
| Cliente REST | `lib/n8n/client.ts` | `listWorkflows()`, `getWorkflow(id)`, `updateWorkflow(id, body)` con timeouts y errores en español para la UI |
| Extractores | `lib/n8n/extractors.ts` | Por tipo de nodo: leer y escribir el campo del prompt dentro del JSON del nodo |
| Motor de sync | `lib/n8n/sync.ts` | Orquestar push, drift check, rollback; nunca se importa desde componentes cliente |
| Bitácora | Tabla `n8n_sync_events` | Auditoría + snapshots para revertir |

Todo server-side, siguiendo la regla 5 de CLAUDE.md. El navegador solo habla
con `/api/...` del Studio; jamás ve la API key de n8n.

## 5. Modelo de datos (nueva migración `011_n8n_sync.sql`)

`001_initial.sql` no se toca. Tres tablas nuevas:

```sql
-- Conexión (una sola instancia de n8n por ahora, pero la tabla lo deja abierto)
create table integration_settings (
  id uuid primary key default uuid_generate_v4(),
  kind text not null unique check (kind in ('n8n')),
  base_url text not null,
  api_key_encrypted text not null,        -- mismo formato que providers
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vínculo cliente ↔ nodo de n8n. Un cliente puede tener varios
-- (ej. Sofía vive en "Comentarios&DM's" y en "CP llamada").
create table n8n_bindings (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  workflow_id text not null,              -- id de n8n, ej. "XwWC0INCwg6l3ESy"
  workflow_name text not null,            -- cache para mostrar en UI
  node_id text not null,                  -- id estable del nodo (uuid de n8n)
  node_name text not null,                -- cache para UI y fallback de búsqueda
  node_type text not null,                -- decide qué extractor usar
  prompt_locator jsonb not null,          -- detalle del campo, ej. índice del
                                          -- mensaje system en messages.values
  expression_prefix boolean not null default false,  -- el valor original traía "="
  sync_enabled boolean not null default true,
  last_pushed_version_id uuid references versions(id) on delete set null,
  last_pushed_hash text,                  -- sha256 del texto empujado, para drift
  last_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_id, node_id, client_id)
);

-- Bitácora de sincronizaciones. También es el mecanismo de rollback:
-- previous_content guarda lo que había en el nodo antes de sobreescribir.
create table n8n_sync_events (
  id uuid primary key default uuid_generate_v4(),
  binding_id uuid references n8n_bindings(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  version_id uuid references versions(id) on delete set null,
  action text not null check (action in ('push', 'rollback', 'drift_detected')),
  status text not null check (status in ('success', 'error')),
  previous_content text,
  pushed_content text,
  error_message text,
  created_at timestamptz not null default now()
);
```

Notas:
- El historial de workflows de n8n es feature enterprise; por eso el
  snapshot para rollback vive de nuestro lado (`previous_content`).
- `prompt_locator` como jsonb evita una columna por cada rareza de nodo.
  Ejemplos: `{"path": "options.systemMessage"}` para AI Agent,
  `{"path": "messages.values", "role": "system", "index": 1}` para el
  nodo openAi.
- RLS permisivo `to authenticated` como el resto del esquema (defensa en
  profundidad, el acceso real es service_role server-side).

## 6. La API de n8n y sus trampas

### 6.1 Endpoints que usaremos

| Uso | Endpoint |
|---|---|
| Listar workflows para el picker | `GET /api/v1/workflows?limit=100` |
| Leer un workflow completo | `GET /api/v1/workflows/{id}` |
| Escribir el prompt | `PUT /api/v1/workflows/{id}` |
| Probar conexión en Settings | `GET /api/v1/workflows?limit=1` |

Autenticación: header `X-N8N-API-KEY`. La key se genera en n8n en
Settings → n8n API (la crea el owner de la instancia; pedirla es un
prerequisito del sprint). n8n recarga los workflows activos al recibir el
PUT, así que el cambio queda vivo de inmediato, sin reiniciar nada.

### 6.2 El PUT es de reemplazo total (riesgo número 1)

La API de n8n no tiene "actualiza solo este campo". `PUT` espera el
workflow completo (`name`, `nodes`, `connections`, `settings`) y reemplaza
todo. Mitigaciones obligatorias en `lib/n8n/sync.ts`:

1. **Leer-modificar-escribir atómico y corto**: GET fresco, mutar
   únicamente el string del prompt en memoria, PUT inmediato. Nunca
   reutilizar un JSON leído minutos antes (por ejemplo el del preview del
   diff en la UI).
2. **Detección de edición concurrente**: al mostrar el diff de
   confirmación se captura `versionId`/`updatedAt` del workflow. Antes del
   PUT se relee; si cambió, se aborta con "El flujo cambió en n8n mientras
   confirmabas, revisa y reintenta".
3. **Sanitizar el body del PUT**: la API rechaza campos read-only
   (`id`, `active`, `createdAt`, `updatedAt`, `tags`, etc.). El cliente
   REST arma el body solo con los campos escribibles.
4. **Snapshot previo siempre**: `previous_content` en la bitácora antes de
   cada escritura. El botón "Revertir" del sync log empuja ese texto de
   vuelta.

### 6.3 Expresiones de n8n (riesgo número 2, ya observado en producción)

En n8n, un parámetro string que empieza con `=` se evalúa como expresión y
los `{{ ... }}` internos se interpolan con datos del flujo. El prompt de
Sofía en producción empieza con `=`. Reglas del motor:

- Al vincular, se guarda si el valor original traía el prefijo
  (`expression_prefix`). Al empujar, se preserva: si estaba, se antepone.
- Si el texto **original** del nodo contiene `{{ ... }}` (interpolación de
  datos del lead, por ejemplo) y el prompt nuevo del Studio no los trae,
  la UI bloquea el push con una advertencia clara: empujar rompería la
  inyección de datos. El usuario decide si continuar.
- Si el prompt nuevo contiene `{{ }}` literales que NO deben evaluarse y
  el campo lleva prefijo `=`, se advierte también (n8n intentaría
  evaluarlos).

Esto es lo más delicado de todo el plan y merece tests unitarios propios.

### 6.4 Extractores por tipo de nodo (alcance inicial)

| Tipo de nodo | Dónde vive el prompt | Estado |
|---|---|---|
| `@n8n/n8n-nodes-langchain.agent` | `parameters.options.systemMessage` | Soportado en v1 |
| `@n8n/n8n-nodes-langchain.openAi` | mensaje `role: system` en `parameters.messages.values[]` | Soportado en v1 |
| `n8n-nodes-base.code`, HTTP bodies, otros | prompt embebido en código o JSON arbitrario | Fuera de v1; el picker los oculta |

El registro de extractores es extensible: agregar un tipo nuevo es un
archivo con `read(node, locator)` y `write(node, locator, text)`.

## 7. Flujos de usuario (UI en español)

### 7.1 Conectar n8n (una vez, en Settings)

Settings → nueva sección "Integración n8n": URL base, API key, botón
"Probar conexión". La key se cifra al guardar y nunca vuelve a mostrarse
completa (solo `••••` + últimos 4).

### 7.2 Vincular un cliente (una vez por cliente)

En el client detail de la Library, tarjeta "n8n":

1. "Vincular con n8n" abre un modal.
2. Paso 1: buscador de workflows (nombre, vía `GET /workflows`).
3. Paso 2: lista de nodos compatibles del workflow elegido (solo tipos
   soportados), mostrando un preview del prompt que contiene cada uno,
   para que el usuario reconozca el suyo.
4. Paso 3: confirmación. Si el texto del nodo no se parece al prompt de
   producción del cliente (ni comparte la línea `Versión: X.Y`), se
   advierte por si se está vinculando el nodo equivocado.
5. Se pueden agregar varios bindings (multi-flujo) y desvincular cada uno.

### 7.3 Promover con sincronización

1. Usuario presiona "Promover a producción" en un cliente con bindings.
2. Modal de confirmación muestra, por cada binding: workflow, nodo, y el
   **diff** entre lo que hay en n8n ahora mismo y lo que se va a empujar.
3. Al confirmar: primero se marca `is_production` en DB (como hoy), luego
   se empuja binding por binding.
4. Resultado parcial posible: si un push falla, la promoción en DB NO se
   revierte (la verdad del Studio ya cambió); el binding queda en estado
   "Pendiente de sincronizar" con botón "Reintentar". Nunca se deja al
   usuario sin saber qué pasó.
5. Clientes sin binding: el flujo actual no cambia en nada (copiar al
   portapapeles sigue existiendo siempre, también como plan B).

### 7.4 Drift y estado

- En el client detail, cada binding muestra un badge de estado calculado
  al abrir la página (GET al workflow + comparación de hash con
  `last_pushed_hash`):
  - **Sincronizado**: el nodo tiene exactamente lo último que se empujó.
  - **Desincronizado**: alguien editó el nodo a mano después del último
    push. Acciones: "Ver diff", "Empujar producción" (pisa lo de n8n) o
    "Importar desde n8n" (trae el texto como versión nueva, reutilizando
    el flujo de import existente).
  - **Pendiente**: el último push falló.
  - **Sin verificar**: n8n no respondió (no bloquea nada, solo informa).
- Historial "Sincronizaciones" (de `n8n_sync_events`) con botón
  "Revertir" en cada push exitoso.

## 8. Seguridad

- La API key de n8n puede reescribir TODOS los workflows de la agencia,
  no solo prompts. Tratamiento: cifrada con `lib/crypto.ts` (AES-256-GCM,
  mismo formato que providers), solo descifrada dentro de API routes,
  jamás en el cliente, jamás en logs. Sin cambios a `.env` (vive en DB,
  como las keys de LLM). Rotarla en n8n si se sospecha fuga.
- El motor de sync solo ejecuta `GET workflow` y `PUT workflow`; no expone
  ejecución ni borrado, aunque la key lo permita.
- App y n8n corren en el mismo EasyPanel: evaluar usar el hostname interno
  para que el tráfico no salga a internet (optimización, no bloqueante).
- Los `n8n_sync_events` guardan prompts completos (contenido sensible de
  clientes): mismas garantías que la tabla `versions`, nada nuevo expuesto.

## 9. Plan de implementación (propuesta de Sprint 7)

Tickets en orden, uno a la vez, según las reglas del repo:

| Ticket | Alcance | Riesgo |
|---|---|---|
| S7-T1 | Migración `011_n8n_sync.sql` (3 tablas + índices + RLS) | Bajo |
| S7-T2 | `lib/n8n/client.ts` (REST) + `lib/n8n/extractors.ts` + tests de extractores y del manejo de `=` y `{{ }}` | Medio |
| S7-T3 | Settings: sección "Integración n8n" + `/api/integrations/n8n` (guardar cifrado, probar conexión) | Bajo |
| S7-T4 | UI de vinculación en client detail + `/api/clients/[id]/n8n-bindings` (picker de workflow/nodo con preview) | Medio |
| S7-T5 | Motor `lib/n8n/sync.ts` + hook en promote + modal de diff + estados pendiente/reintentar | Alto |
| S7-T6 | Drift badge, historial de sincronizaciones, revertir, "Importar desde n8n" desde el diff | Medio |
| S7-T7 | Docs: actualizar `ARCHITECTURE.md` y `SPEC.md` en inglés con lo implementado | Bajo |

Sin dependencias nuevas previstas: fetch nativo para la API de n8n, crypto
ya existe, diff ya existe en `lib/version-utils.ts`.

Prerequisito humano antes de S7-T3: generar la API key en la instancia de
n8n (Settings → n8n API) y tenerla a la mano para cargarla en el Studio.

## 10. Decisiones abiertas (para pulir antes de codear)

1. **¿Push automático o con confirmación?** Este plan propone SIEMPRE
   mostrar el diff y confirmar (es producción de clientes reales). Se
   puede agregar un toggle "empujar sin preguntar" por binding después.
2. **¿Promover sigue funcionando si n8n está caído?** Propuesta: sí, la
   promoción en DB procede y el binding queda "Pendiente". Alternativa
   más estricta: bloquear la promoción completa. Decidir.
3. **Prompts que viven en nodos no soportados** (Code, HTTP body): ¿hay
   alguno hoy? Si sí, decidir si v1 los necesita o si se migran esos
   flujos a AI Agent primero.
4. **¿Un binding puede apuntar a un workflow inactivo o de staging?**
   Propuesta: sí, sin distinción especial en v1; multi-entorno queda para
   después.
5. Nombre de la sección en UI: "n8n", "Producción n8n", "Despliegue".

## 11. Evolución futura (fuera de este plan)

- Opción B (pull en runtime) para drift cero, si algún día se acepta la
  dependencia.
- Webhook de n8n → Studio al editar un workflow, para detectar drift en
  tiempo real en lugar de al abrir la página.
- Soporte multi-instancia de n8n (la tabla `integration_settings` ya lo
  permite estructuralmente).
- Auto-vinculación al importar: si un prompt se importa "desde n8n", crear
  el binding en el mismo paso.

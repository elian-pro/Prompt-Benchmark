# Plan: sincronización de prompts con n8n ("Promover" actualiza el nodo)

> Estado: PROPUESTA, revisión 3. Nada de esto está implementado. Este
> documento existe para pulirse antes de escribir código. Cuando se
> apruebe, se convertirá en el Sprint 7 y las decisiones finales se
> integrarán a `docs/ARCHITECTURE.md` y `docs/SPEC.md`.

## 1. Objetivo

Hoy el flujo termina en un paso manual: el usuario copia el prompt al
portapapeles y lo pega en el nodo de n8n. La meta es que al presionar
**"Promover a producción"** en la Library, el Studio también escriba ese
prompt directamente en el nodo de n8n donde vive en producción.

El Studio pasa de ser "el lugar donde se edita" a ser la **fuente de
verdad** del prompt, y n8n pasa a ser un destino de despliegue.

Fuera de alcance (por ahora): crear o modificar flujos de n8n más allá del
system prompt del nodo vinculado, activar/desactivar workflows, y
sincronizar en sentido n8n → Studio de forma automática (eso sigue siendo
"Importar").

## 2. Premisas estructurales (confirmadas por el equipo)

1. **Todos los prompts de clientes viven en nodos AI Agent**
   (`@n8n/n8n-nodes-langchain.agent`). El prompt es siempre el campo
   `parameters.options.systemMessage`. El Studio no necesita soportar
   otros tipos de nodo en v1.
2. **Un workflow puede tener VARIOS nodos AI Agent.** Por lo tanto el
   Studio nunca adivina cuál es el correcto: el usuario selecciona
   manualmente el flujo Y el nodo, idealmente en el momento de dar de
   alta al cliente (sección 8.2).

Consecuencias de diseño:

- El binding guarda una referencia explícita al nodo elegido (`node_id`,
  el id interno estable que n8n asigna a cada nodo, más `node_name` como
  cache legible).
- En cada push o verificación, el nodo se localiza por `node_id`. Si no
  aparece (flujo reconstruido), se intenta por `node_name` como fallback
  y se pide re-confirmación; si tampoco, el binding queda en error claro
  ("El nodo vinculado ya no existe en el flujo, vuelve a vincular") y no
  se escribe nada.
- Un cliente puede tener varios bindings, incluso dos nodos del mismo
  workflow (por ejemplo un agente para comentarios y otro para DMs dentro
  del mismo flujo).

## 3. Contexto verificado en la app

- "Promover a producción" es `POST /api/versions/[id]/promote` →
  `promoteToProduction()` en `lib/db/versions.ts`. Solo mueve el tag
  `is_production` entre versiones del cliente, no crea versión nueva.
  Este es el punto de enganche natural para el push a n8n.
- Cada prompt lleva una línea `Versión: X.Y` que `syncVersionLine()`
  mantiene sincronizada con `version_number`. Fue diseñada justo para
  identificar la versión de un prompt viviendo en n8n; aquí la usamos
  para verificación y detección de drift.
- El import desde n8n ya existe (`bump_type: 'imported'`, marca
  `is_legacy`). El vínculo cliente ↔ nodo hoy solo existe en la cabeza
  del equipo; este plan lo vuelve dato.
- Los secretos ya tienen patrón establecido: cifrado AES-256-GCM en
  `lib/crypto.ts`, almacenados en DB (como `providers`), usados solo
  server-side desde API routes. La API key de n8n seguirá ese patrón.
- La instancia de n8n es self-hosted en EasyPanel
  (`https://n8n-n8n.9qd6cz.easypanel.host`), misma infra que la app.
  El Studio hablará con su **API pública REST** usando una API key propia.

## 4. Decisión de arquitectura: push vs pull

Hay dos formas de lograr "lo que está en producción en el Studio es lo que
corre en n8n":

| | **Opción A: Push (recomendada)** | Opción B: Pull en runtime |
|---|---|---|
| Cómo funciona | Al promover, el Studio escribe el systemMessage del nodo vinculado vía API REST de n8n | Cada workflow arranca pidiendo el prompt de producción al Studio (o a Supabase) |
| Cambios en n8n | Ninguno | Editar todos los flujos una vez para agregar el fetch |
| Dependencia en runtime | n8n sigue autocontenido; si el Studio se cae, producción no se entera | Si el Studio o Supabase se caen, los bots de los clientes fallan |
| Latencia por ejecución | Cero | Una llamada HTTP extra por ejecución |
| Drift posible | Sí, si alguien edita el nodo a mano (se detecta, sección 8.5) | No, imposible por diseño |
| Riesgo principal | El PUT de n8n reemplaza el workflow completo (sección 7.2) | Acoplar producción de clientes a un tool interno |

**Recomendación: Opción A (push).** Los flujos atienden leads de clientes
reales; meterles una dependencia en runtime hacia una herramienta interna
es un riesgo desproporcionado. El push mantiene n8n exactamente como está
y solo automatiza el copiar y pegar. La opción B queda documentada como
evolución futura si algún día se quiere drift cero.

## 5. Arquitectura propuesta (opción A)

```
Library (alta de cliente o client detail)
  │
  │  vincular: elegir workflow → elegir nodo AI Agent → confirmar
  │  (guardado en n8n_bindings)
  │
  │  "Promover a producción" (cliente con bindings)
  ▼
POST /api/versions/[id]/promote        ──► marca is_production (igual que hoy)
  │                                        y si hay bindings:
  ▼
lib/n8n/sync.ts  (motor de sincronización)
  │  1. GET workflow completo a la API de n8n
  │  2. localiza el nodo por node_id (fallback: node_name; si no: error)
  │  3. verifica que siga siendo un AI Agent
  │  4. lee parameters.options.systemMessage actual
  │  5. guarda snapshot del texto anterior (rollback)
  │  6. reemplaza SOLO ese string en el JSON
  │  7. PUT workflow completo de vuelta
  │  8. registra el evento en n8n_sync_events
  ▼
n8n REST API  (X-N8N-API-KEY, cifrada en DB con lib/crypto.ts)
```

Componentes nuevos:

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Conexión n8n | Settings + tabla `integration_settings` | URL base + API key cifrada + "Probar conexión" |
| Bindings | Tabla `n8n_bindings` + UI en alta de cliente y client detail | Vincular un cliente con nodos AI Agent concretos |
| Cliente REST | `lib/n8n/client.ts` | `listWorkflows()`, `getWorkflow(id)`, `updateWorkflow(id, body)`, con timeouts y errores en español para la UI |
| Acceso al nodo | `lib/n8n/agent-node.ts` | Listar los AI Agent de un workflow, localizar el vinculado, leer y escribir su `systemMessage` respetando expresiones |
| Motor de sync | `lib/n8n/sync.ts` | Orquestar push, drift check, rollback |
| Bitácora | Tabla `n8n_sync_events` | Auditoría + snapshots para revertir |

Todo server-side (regla 5 de CLAUDE.md). El navegador solo habla con
`/api/...` del Studio; jamás ve la API key de n8n.

## 6. Modelo de datos (nueva migración `011_n8n_sync.sql`)

`001_initial.sql` no se toca. Tres tablas nuevas:

```sql
-- Conexión (una sola instancia de n8n hoy; la tabla lo deja abierto)
create table integration_settings (
  id uuid primary key default uuid_generate_v4(),
  kind text not null unique check (kind in ('n8n')),
  base_url text not null,
  api_key_encrypted text not null,        -- mismo formato que providers
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vínculo cliente ↔ nodo AI Agent concreto, elegido manualmente.
-- Un cliente puede tener varios (multi-flujo, o dos agentes en el mismo
-- flujo). El nodo se guarda por id estable de n8n + nombre como cache.
create table n8n_bindings (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  workflow_id text not null,              -- id de n8n
  workflow_name text not null,            -- cache para mostrar en UI
  node_id text not null,                  -- id interno del nodo en n8n
  node_name text not null,                -- cache para UI y fallback
  expression_prefix boolean not null default false,  -- el systemMessage
                                          -- original traía "=" (expresión)
  sync_enabled boolean not null default true,
  last_pushed_version_id uuid references versions(id) on delete set null,
  last_pushed_hash text,                  -- sha256 del texto empujado (drift)
  last_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, workflow_id, node_id)
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
- Sin unicidad global sobre `(workflow_id, node_id)` a propósito: dos
  clientes no deberían compartir nodo, pero bloquearlo a nivel DB estorba
  en migraciones o duplicados temporales. La UI sí advierte si el nodo ya
  está vinculado a otro cliente.
- RLS permisivo `to authenticated`, como el resto del esquema.

## 7. La API de n8n y sus trampas

### 7.1 Endpoints

| Uso | Endpoint |
|---|---|
| Listar workflows para el picker | `GET /api/v1/workflows?limit=100` |
| Leer un workflow completo (picker de nodos, push, drift) | `GET /api/v1/workflows/{id}` |
| Escribir el prompt | `PUT /api/v1/workflows/{id}` |
| Probar conexión en Settings | `GET /api/v1/workflows?limit=1` |

Autenticación: header `X-N8N-API-KEY`. La key se genera en n8n en
Settings → n8n API (prerequisito humano del sprint). n8n recarga los
workflows activos al recibir el PUT: el cambio queda vivo de inmediato,
sin reiniciar nada.

### 7.2 El PUT es de reemplazo total (riesgo número 1)

La API de n8n no tiene "actualiza solo este campo". `PUT` espera el
workflow completo (`name`, `nodes`, `connections`, `settings`) y reemplaza
todo. Mitigaciones obligatorias en `lib/n8n/sync.ts`:

1. **Leer-modificar-escribir atómico y corto**: GET fresco, mutar
   únicamente el string del systemMessage en memoria, PUT inmediato.
   Nunca reutilizar un JSON leído minutos antes (por ejemplo el del
   preview del diff en la UI).
2. **Detección de edición concurrente**: al mostrar el diff de
   confirmación se captura `versionId`/`updatedAt` del workflow. Antes
   del PUT se relee; si cambió, se aborta con "El flujo cambió en n8n
   mientras confirmabas, revisa y reintenta".
3. **Sanitizar el body del PUT**: la API rechaza campos read-only (`id`,
   `active`, `createdAt`, `updatedAt`, `tags`, etc.). El cliente REST
   arma el body solo con los campos escribibles.
4. **Snapshot previo siempre**: `previous_content` en la bitácora antes
   de cada escritura. "Revertir" empuja ese texto de vuelta.

### 7.3 Expresiones de n8n (riesgo número 2)

En n8n, un parámetro string que empieza con `=` se evalúa como expresión:
los `{{ ... }}` internos se interpolan con datos del flujo en runtime. El
campo `systemMessage` de un AI Agent puede usarse así, por ejemplo para
inyectar el nombre del lead en el prompt. Reglas del motor:

- Al vincular, se detecta y guarda si el valor original trae el prefijo
  (`expression_prefix`). Al empujar, se preserva: si estaba, se antepone.
- Si el systemMessage **actual** del nodo contiene `{{ ... }}` y el prompt
  nuevo del Studio no los trae, la UI bloquea el push con advertencia
  clara: empujar rompería la inyección de datos. El usuario decide.
- Si el prompt nuevo contiene `{{ }}` literales que NO deben evaluarse y
  el campo lleva prefijo `=`, también se advierte (n8n intentaría
  evaluarlos).

Es la parte más delicada del plan y lleva tests unitarios propios en
`lib/n8n/agent-node.ts`.

### 7.4 Localización del nodo vinculado

`lib/n8n/agent-node.ts` implementa las premisas de la sección 2:

- `listAgentNodes(workflow)`: filtra `nodes` por
  `type === "@n8n/n8n-nodes-langchain.agent"` y devuelve id, nombre y
  preview del systemMessage de cada uno. Alimenta el picker de la UI.
- `findBoundNode(workflow, binding)`: busca por `node_id`; si no está,
  intenta por `node_name` (caso: flujo reconstruido a mano, los ids
  cambian pero el nombre suele conservarse) y marca el resultado como
  "encontrado por nombre" para que la UI pida re-confirmar y actualice el
  `node_id` guardado. Si tampoco, error descriptivo y no se escribe nada.
- Verificación de tipo: aunque se encuentre el id, si el nodo ya no es un
  AI Agent se aborta (alguien pudo reemplazarlo).
- `readSystemMessage(node)` / `writeSystemMessage(node, text)`: acceden a
  `parameters.options.systemMessage` manejando el caso de que `options`
  no exista aún (nodo recién creado con el prompt vacío) y el prefijo `=`.
- Versionado del nodo (`typeVersion`) no afecta la ruta del campo en las
  versiones actuales del nodo AI Agent; si n8n la moviera en el futuro,
  este archivo es el único punto a tocar.

## 8. Flujos de usuario (UI en español)

### 8.1 Conectar n8n (una vez, en Settings)

Settings → nueva sección "Integración n8n": URL base, API key, botón
"Probar conexión". La key se cifra al guardar y nunca vuelve a mostrarse
completa (solo `••••` + últimos 4).

### 8.2 Vincular al dar de alta al cliente (el camino feliz)

El modal de nuevo cliente en la Library gana un paso opcional "Vincular
con n8n" (visible solo si la integración está configurada):

1. Buscador de workflows por nombre (`GET /workflows`).
2. Al elegir uno, se listan **sus nodos AI Agent** (nombre + preview de
   las primeras líneas del systemMessage de cada uno), porque un flujo
   puede tener varios. El usuario marca el suyo.
3. Se pueden agregar más pares flujo/nodo antes de guardar (por ejemplo
   el agente de comentarios y el de llamadas).
4. El paso es saltable: un cliente puede nacer sin binding y vincularse
   después.

Aplica igual al flujo de "Importar prompt existente": ahí es todavía más
natural, porque el usuario está trayendo el prompt justamente desde un
nodo de n8n; vincular en el mismo paso deja el sistema listo (y es la
"auto-vinculación" de la sección 12, que puede adelantarse si se quiere).

### 8.3 Vincular o ajustar después (client detail)

En el client detail de la Library, tarjeta "n8n": misma experiencia de
picker (workflow → nodo AI Agent → confirmar), con la lista de bindings
existentes, desvincular por binding, y advertencias suaves:

- Si el texto del nodo elegido no se parece al prompt de producción del
  cliente (ni comparte la línea `Versión: X.Y`), se avisa por si se está
  vinculando el nodo equivocado.
- Si el nodo ya está vinculado a otro cliente, también se avisa.

### 8.4 Promover con sincronización

1. Usuario presiona "Promover a producción" en un cliente con bindings.
2. Modal de confirmación muestra, por cada binding (workflow + nodo), el
   **diff** entre lo que hay en n8n ahora mismo y lo que se va a empujar.
3. Al confirmar: primero se marca `is_production` en DB (como hoy), luego
   se empuja binding por binding.
4. Resultado parcial posible: si un push falla, la promoción en DB NO se
   revierte (la verdad del Studio ya cambió); el binding queda "Pendiente
   de sincronizar" con botón "Reintentar". Nunca se deja al usuario sin
   saber qué pasó.
5. Clientes sin binding: el flujo actual no cambia en nada. Copiar al
   portapapeles sigue existiendo siempre, también como plan B.

### 8.5 Drift y estado

- En el client detail, cada binding muestra un badge calculado al abrir
  la página (GET al workflow + comparación de hash del systemMessage con
  `last_pushed_hash`):
  - **Sincronizado**: el nodo tiene exactamente lo último que se empujó.
  - **Desincronizado**: alguien editó el nodo a mano después del último
    push. Acciones: "Ver diff", "Empujar producción" (pisa lo de n8n) o
    "Importar desde n8n" (trae el texto como versión nueva, reutilizando
    el import existente).
  - **Pendiente**: el último push falló.
  - **Nodo no encontrado**: el flujo cambió y el nodo vinculado ya no
    existe; acción "Volver a vincular".
  - **Sin verificar**: n8n no respondió (no bloquea nada, solo informa).
- Historial "Sincronizaciones" (de `n8n_sync_events`) con botón
  "Revertir" en cada push exitoso.

## 9. Seguridad

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
  clientes): mismas garantías que la tabla `versions`, nada nuevo
  expuesto.

## 10. Plan de implementación (propuesta de Sprint 7)

Tickets en orden, uno a la vez, según las reglas del repo:

| Ticket | Alcance | Riesgo |
|---|---|---|
| S7-T1 | Migración `011_n8n_sync.sql` (3 tablas + índices + RLS) | Bajo |
| S7-T2 | `lib/n8n/client.ts` (REST) + `lib/n8n/agent-node.ts` (listar agentes, localizar nodo por id con fallback por nombre, lectura/escritura del systemMessage, manejo de `=` y `{{ }}`) + tests | Medio |
| S7-T3 | Settings: sección "Integración n8n" + `/api/integrations/n8n` (guardar cifrado, probar conexión) | Bajo |
| S7-T4 | Picker de vinculación (workflow → nodo AI Agent con preview) como componente reutilizable + `/api/clients/[id]/n8n-bindings` + tarjeta "n8n" en client detail | Medio |
| S7-T5 | Integrar el picker al alta de cliente y al import (paso opcional "Vincular con n8n") | Bajo |
| S7-T6 | Motor `lib/n8n/sync.ts` + hook en promote + modal de diff + estados pendiente/reintentar | Alto |
| S7-T7 | Drift badge, "Nodo no encontrado" + re-vincular, historial de sincronizaciones, revertir, "Importar desde n8n" desde el diff | Medio |
| S7-T8 | Docs: actualizar `ARCHITECTURE.md` y `SPEC.md` en inglés con lo implementado | Bajo |

Sin dependencias nuevas previstas: fetch nativo para la API de n8n, crypto
ya existe, diff ya existe en `lib/version-utils.ts`.

Prerequisito humano antes de S7-T3: generar la API key en la instancia de
n8n (Settings → n8n API) y tenerla a la mano para cargarla en el Studio.

## 11. Decisiones abiertas (para pulir antes de codear)

1. **¿Push automático o con confirmación?** Este plan propone SIEMPRE
   mostrar el diff y confirmar (es producción de clientes reales). Se
   puede agregar un toggle "empujar sin preguntar" por binding después.
2. **¿Promover sigue funcionando si n8n está caído?** Propuesta: sí, la
   promoción en DB procede y el binding queda "Pendiente". Alternativa
   más estricta: bloquear la promoción completa. Decidir.
3. **¿Un binding puede apuntar a un workflow inactivo o de staging?**
   Propuesta: sí, sin distinción especial en v1; multi-entorno queda para
   después.
4. **¿Adelantar la auto-vinculación en el import?** (sección 8.2). Barata
   si el picker ya existe; decidir si entra en S7-T5 o después.
5. Nombre de la sección en UI: "n8n", "Producción n8n", "Despliegue".

## 12. Evolución futura (fuera de este plan)

- Opción B (pull en runtime) para drift cero, si algún día se acepta la
  dependencia.
- Webhook de n8n → Studio al editar un workflow, para detectar drift en
  tiempo real en lugar de al abrir la página.
- Soporte multi-instancia de n8n (la tabla `integration_settings` ya lo
  permite estructuralmente).
- Soporte de otros tipos de nodo (Chain LLM, OpenAI message) si algún
  prompt dejara de vivir en un AI Agent.

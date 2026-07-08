# Plan: sincronización de prompts con n8n ("Promover" actualiza el nodo)

> Estado: PROPUESTA, revisión 2. Nada de esto está implementado. Este
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
system prompt del AI Agent, activar/desactivar workflows, y sincronizar en
sentido n8n → Studio de forma automática (eso sigue siendo "Importar").

## 2. Premisa estructural (confirmada por el equipo)

**Todos los system prompts de clientes viven en un nodo AI Agent
(`@n8n/n8n-nodes-langchain.agent`), y hay exactamente uno por workflow.**

Esta regla es la piedra angular del diseño y lo simplifica mucho:

- El prompt siempre vive en el mismo campo:
  `parameters.options.systemMessage` del nodo AI Agent.
- Vincular un cliente ya no requiere elegir un nodo: basta elegir el
  **workflow**. El Studio localiza el AI Agent solo.
- El nodo se resuelve **en cada operación** (push, drift check), no se
  guarda una referencia fija. Si el equipo renombra el nodo o reconstruye
  el flujo, el binding sigue funcionando mientras la regla "un AI Agent
  por flujo" se mantenga.
- Si al resolver aparecen cero o más de un AI Agent, el Studio no adivina:
  aborta con un error claro ("El flujo ya no cumple la regla de un solo
  AI Agent") y no escribe nada.

No hay registro de extractores ni soporte multi-tipo de nodo. Si algún día
un prompt vive en otro tipo de nodo, ese flujo se migra a AI Agent antes
de vincularlo; el Studio no se complica por la excepción.

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
  `is_legacy`). El vínculo cliente ↔ workflow hoy solo existe en la
  cabeza del equipo; este plan lo vuelve dato.
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
| Cómo funciona | Al promover, el Studio escribe el systemMessage del AI Agent vía API REST de n8n | Cada workflow arranca pidiendo el prompt de producción al Studio (o a Supabase) |
| Cambios en n8n | Ninguno | Editar todos los flujos una vez para agregar el fetch |
| Dependencia en runtime | n8n sigue autocontenido; si el Studio se cae, producción no se entera | Si el Studio o Supabase se caen, los bots de los clientes fallan |
| Latencia por ejecución | Cero | Una llamada HTTP extra por ejecución |
| Drift posible | Sí, si alguien edita el nodo a mano (se detecta, sección 8.4) | No, imposible por diseño |
| Riesgo principal | El PUT de n8n reemplaza el workflow completo (sección 7.2) | Acoplar producción de clientes a un tool interno |

**Recomendación: Opción A (push).** Los flujos atienden leads de clientes
reales; meterles una dependencia en runtime hacia una herramienta interna
es un riesgo desproporcionado. El push mantiene n8n exactamente como está
y solo automatiza el copiar y pegar. La opción B queda documentada como
evolución futura si algún día se quiere drift cero.

## 5. Arquitectura propuesta (opción A)

```
Library (client detail)
  │
  │  "Promover a producción" (cliente con workflows vinculados)
  ▼
POST /api/versions/[id]/promote        ──► marca is_production (igual que hoy)
  │                                        y si hay bindings:
  ▼
lib/n8n/sync.ts  (motor de sincronización)
  │  1. GET workflow completo a la API de n8n
  │  2. localiza EL nodo AI Agent (exactamente uno, si no: aborta)
  │  3. lee parameters.options.systemMessage actual
  │  4. guarda snapshot del texto anterior (rollback)
  │  5. reemplaza SOLO ese string en el JSON
  │  6. PUT workflow completo de vuelta
  │  7. registra el evento en n8n_sync_events
  ▼
n8n REST API  (X-N8N-API-KEY, cifrada en DB con lib/crypto.ts)
```

Componentes nuevos:

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Conexión n8n | Settings + tabla `integration_settings` | URL base + API key cifrada + "Probar conexión" |
| Bindings | Tabla `n8n_bindings` + UI en client detail | Vincular un cliente con uno o más workflows |
| Cliente REST | `lib/n8n/client.ts` | `listWorkflows()`, `getWorkflow(id)`, `updateWorkflow(id, body)`, con timeouts y errores en español para la UI |
| Resolución del agente | `lib/n8n/agent-node.ts` | Encontrar el único AI Agent del workflow; leer y escribir su `systemMessage` respetando expresiones |
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

-- Vínculo cliente ↔ workflow. Un cliente puede vivir en varios flujos
-- (comentarios, llamadas, DMs), por eso no es 1 a 1. El nodo AI Agent
-- NO se guarda: se resuelve en cada operación (premisa: uno por flujo).
create table n8n_bindings (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  workflow_id text not null,              -- id de n8n
  workflow_name text not null,            -- cache para mostrar en UI
  expression_prefix boolean not null default false,  -- el systemMessage
                                          -- original traía "=" (expresión)
  sync_enabled boolean not null default true,
  last_pushed_version_id uuid references versions(id) on delete set null,
  last_pushed_hash text,                  -- sha256 del texto empujado (drift)
  last_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, workflow_id)
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
- Sin `unique (workflow_id)` global a propósito: en teoría dos clientes no
  deberían compartir workflow, pero bloquearlo a nivel DB estorba en
  migraciones o duplicados temporales. La UI sí advierte si el workflow
  ya está vinculado a otro cliente.
- RLS permisivo `to authenticated`, como el resto del esquema.

## 7. La API de n8n y sus trampas

### 7.1 Endpoints

| Uso | Endpoint |
|---|---|
| Listar workflows para el picker | `GET /api/v1/workflows?limit=100` |
| Leer un workflow completo | `GET /api/v1/workflows/{id}` |
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

### 7.4 Resolución del nodo AI Agent

`agent-node.ts` implementa la premisa de la sección 2:

- `findAgentNode(workflow)`: filtra `nodes` por
  `type === "@n8n/n8n-nodes-langchain.agent"`. Devuelve el nodo si hay
  exactamente uno; lanza error descriptivo si hay cero o varios.
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

### 8.2 Vincular un cliente (una vez por cliente)

En el client detail de la Library, tarjeta "n8n":

1. "Vincular con n8n" abre un modal con buscador de workflows por nombre.
2. Al elegir uno, el Studio localiza su AI Agent y muestra un preview del
   systemMessage actual, para que el usuario confirme que es el prompt
   correcto. Si el workflow no tiene AI Agent (o tiene varios), se explica
   y no se puede vincular.
3. Verificación suave: si el texto del nodo no se parece al prompt de
   producción del cliente (ni comparte la línea `Versión: X.Y`), se
   advierte por si se está vinculando el flujo equivocado. Si el workflow
   ya está vinculado a otro cliente, también.
4. Se pueden agregar varios workflows por cliente y desvincular cada uno.

### 8.3 Promover con sincronización

1. Usuario presiona "Promover a producción" en un cliente con bindings.
2. Modal de confirmación muestra, por cada workflow vinculado, el **diff**
   entre lo que hay en n8n ahora mismo y lo que se va a empujar.
3. Al confirmar: primero se marca `is_production` en DB (como hoy), luego
   se empuja workflow por workflow.
4. Resultado parcial posible: si un push falla, la promoción en DB NO se
   revierte (la verdad del Studio ya cambió); el binding queda "Pendiente
   de sincronizar" con botón "Reintentar". Nunca se deja al usuario sin
   saber qué pasó.
5. Clientes sin binding: el flujo actual no cambia en nada. Copiar al
   portapapeles sigue existiendo siempre, también como plan B.

### 8.4 Drift y estado

- En el client detail, cada workflow vinculado muestra un badge calculado
  al abrir la página (GET al workflow + comparación de hash del
  systemMessage con `last_pushed_hash`):
  - **Sincronizado**: el nodo tiene exactamente lo último que se empujó.
  - **Desincronizado**: alguien editó el nodo a mano después del último
    push. Acciones: "Ver diff", "Empujar producción" (pisa lo de n8n) o
    "Importar desde n8n" (trae el texto como versión nueva, reutilizando
    el import existente).
  - **Pendiente**: el último push falló.
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
| S7-T2 | `lib/n8n/client.ts` (REST) + `lib/n8n/agent-node.ts` (resolución del agente, lectura/escritura del systemMessage, manejo de `=` y `{{ }}`) + tests | Medio |
| S7-T3 | Settings: sección "Integración n8n" + `/api/integrations/n8n` (guardar cifrado, probar conexión) | Bajo |
| S7-T4 | UI de vinculación en client detail + `/api/clients/[id]/n8n-bindings` (picker de workflow con preview del systemMessage) | Medio |
| S7-T5 | Motor `lib/n8n/sync.ts` + hook en promote + modal de diff + estados pendiente/reintentar | Alto |
| S7-T6 | Drift badge, historial de sincronizaciones, revertir, "Importar desde n8n" desde el diff | Medio |
| S7-T7 | Docs: actualizar `ARCHITECTURE.md` y `SPEC.md` en inglés con lo implementado | Bajo |

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
4. Nombre de la sección en UI: "n8n", "Producción n8n", "Despliegue".

## 12. Evolución futura (fuera de este plan)

- Opción B (pull en runtime) para drift cero, si algún día se acepta la
  dependencia.
- Webhook de n8n → Studio al editar un workflow, para detectar drift en
  tiempo real en lugar de al abrir la página.
- Soporte multi-instancia de n8n (la tabla `integration_settings` ya lo
  permite estructuralmente).
- Auto-vinculación al importar: si un prompt se importa "desde n8n", crear
  el binding en el mismo paso.

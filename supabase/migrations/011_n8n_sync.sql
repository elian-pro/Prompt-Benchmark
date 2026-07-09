-- ============================================================
-- ZEBRA · PROMPT STUDIO · Migration 011
-- n8n prompt sync (Sprint 7, T1)
-- Run once in the Supabase SQL Editor
-- ============================================================
--
-- Turns "Promover a producción" into a deployment: the Studio becomes the
-- source of truth for a client's prompt and n8n is a deploy target. A target
-- can be reachable by API (Zebra's own n8n, or a client instance that shared
-- an API key) or manual (a client's n8n we cannot reach, where the human
-- pastes the prompt and confirms).
--
-- Three tables ship together even though the Fase A UI only exercises the
-- API path: adding `mode` and the manual columns later would mean a backfill
-- over a populated table. See docs/N8N-SYNC-PLAN.md.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Connections: reachable n8n instances (one row per instance).
--    Zebra's own instance is the first; client instances are added the same
--    way if/when they share credentials. The API key is encrypted with the
--    same AES-256-GCM format used for provider keys (lib/crypto.ts).
-- ------------------------------------------------------------
create table n8n_connections (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  base_url text not null,
  api_key_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_n8n_connections_updated_at
  before update on n8n_connections
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 2. Bindings: a client's deploy targets.
--    mode='api'    → connection + workflow + AI Agent node (all set).
--    mode='manual' → a human-readable label only; deployment is manual and
--                    we record which version the user confirmed.
--    A client can have several bindings, mix modes, or point two agents in
--    the same workflow. The node is stored by its stable n8n id plus name as
--    a cache/fallback; it is re-located on every push (lib/n8n/agent-node).
-- ------------------------------------------------------------
create table n8n_bindings (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  mode text not null check (mode in ('api', 'manual')),

  -- api mode (null in manual)
  connection_id uuid references n8n_connections(id) on delete restrict,
  workflow_id text,
  workflow_name text,
  node_id text,
  node_name text,
  -- the node's original systemMessage started with '=' (an n8n expression);
  -- preserved on every push so {{ }} interpolation keeps working.
  expression_prefix boolean not null default false,
  -- sha256 of the text last pushed, for drift detection against n8n.
  last_pushed_hash text,

  -- manual mode (null in api)
  manual_label text,

  -- common
  sync_enabled boolean not null default true,
  -- which version is live at this target: written by a successful push
  -- (api) or by "Marcar como actualizado" (manual). Drives the pending
  -- reminder: it differs from the client's current production version.
  last_deployed_version_id uuid references versions(id) on delete set null,
  last_deployed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint n8n_bindings_mode_shape check (
    (mode = 'api'
      and connection_id is not null and workflow_id is not null
      and node_id is not null and manual_label is null)
    or
    (mode = 'manual'
      and manual_label is not null and connection_id is null
      and workflow_id is null and node_id is null)
  )
);

create index idx_n8n_bindings_client on n8n_bindings (client_id);
create index idx_n8n_bindings_connection on n8n_bindings (connection_id);

-- Same node cannot be bound twice to the same client. Not global on purpose:
-- the UI warns if a node is already bound elsewhere, but the DB does not block
-- it (avoids friction during re-imports / temporary duplicates).
create unique index unique_api_binding
  on n8n_bindings (client_id, connection_id, workflow_id, node_id)
  where mode = 'api';

-- ------------------------------------------------------------
-- 3. Sync events: audit log + rollback source.
--    n8n's own workflow history is an enterprise feature, so we keep the
--    previous node text here (previous_content) to power "Revertir".
-- ------------------------------------------------------------
create table n8n_sync_events (
  id uuid primary key default uuid_generate_v4(),
  binding_id uuid references n8n_bindings(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  version_id uuid references versions(id) on delete set null,
  action text not null
    check (action in ('push', 'rollback', 'drift_detected', 'manual_confirm')),
  status text not null check (status in ('success', 'error')),
  previous_content text,
  pushed_content text,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_n8n_sync_events_binding on n8n_sync_events (binding_id, created_at desc);
create index idx_n8n_sync_events_client on n8n_sync_events (client_id, created_at desc);

-- ------------------------------------------------------------
-- 4. RLS: defense in depth, mirroring the rest of the schema. The app talks
--    to Supabase with service_role, which bypasses RLS; these permissive
--    policies only matter if the app is ever exposed without Basic Auth.
-- ------------------------------------------------------------
alter table n8n_connections enable row level security;
alter table n8n_bindings enable row level security;
alter table n8n_sync_events enable row level security;

create policy "authenticated_all" on n8n_connections
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on n8n_bindings
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on n8n_sync_events
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select count(*) from n8n_bindings;  -- debería dar 0
-- ============================================================

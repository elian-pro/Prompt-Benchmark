-- ============================================================
-- ZEBRA · PROMPT STUDIO · Migration 019
-- n8n: template workflow per connection (Sprint 16, T2)
-- Run once in the Supabase SQL Editor
-- ============================================================
--
-- Creating a client can duplicate a base workflow and rename the copy
-- "IA Mensajes <Cliente>". The base is stored per connection, not in a global
-- settings row: a workflow id only means something inside its own n8n
-- instance, so the template belongs next to the credentials that can read it.
-- Null means "this connection has no template", and the option is hidden in
-- the Nuevo cliente modal.

alter table n8n_connections
  add column if not exists template_workflow_id text;

-- Denormalized so the UI can show the template's name without hitting n8n on
-- every render. Refreshed whenever the template is re-picked; a rename in n8n
-- only makes this label stale, never the duplication (which uses the id).
alter table n8n_connections
  add column if not exists template_workflow_name text;

-- ============================================================
-- DONE. Verifica con:
--   select name, template_workflow_id, template_workflow_name
--     from n8n_connections;
-- ============================================================

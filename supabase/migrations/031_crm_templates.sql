-- ============================================================
-- ZEBRA · PROMPT STUDIO · Migration 031
-- CRM per client + a second template workflow (Go High Level)
-- Run once in the Supabase SQL Editor
-- ============================================================
--
-- Until now every client's flow was duplicated from one template per n8n
-- connection, and that template was always a Kommo flow. Go High Level needs
-- its own base flow living in the same instance, so the connection holds one
-- template per CRM instead of one template, and the client remembers which CRM
-- it was created for: a provisioning retry from the client's page duplicates
-- the same CRM's template, not whatever the default happens to be.
--
-- Kommo keeps the original columns, so nothing has to be re-picked in Ajustes.

alter table n8n_connections
  add column if not exists template_workflow_id_ghl text,
  add column if not exists template_workflow_name_ghl text;

-- Every existing client runs on Kommo, hence the default and the not null.
alter table clients
  add column if not exists crm text not null default 'kommo';

alter table clients
  drop constraint if exists clients_crm_check;
alter table clients
  add constraint clients_crm_check check (crm in ('kommo', 'ghl'));

-- ============================================================
-- DONE. Verifica con:
--   select name, template_workflow_name, template_workflow_name_ghl
--     from n8n_connections;
--   select crm, count(*) from clients group by crm;
-- ============================================================

-- ============================================================
-- RPC to list the per-client conversation-history tables.
-- Lives in the SECOND Supabase project ("chats"), NOT in prompt_studio.
-- PostgREST does not expose information_schema, so Prompt Studio calls this
-- function via .rpc('list_chat_tables') to populate the "connect history"
-- table picker and to auto-match new clients by name.
-- Returns every public table named chats_<...> with an approximate row count
-- (pg_class.reltuples estimate; exact counts are unnecessary for a UI hint).
-- Run once in the Supabase SQL Editor of the "chats" project.
-- ============================================================

create or replace function public.list_chat_tables()
  returns table (table_name text, row_estimate bigint)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select c.relname::text as table_name,
         greatest(c.reltuples, 0)::bigint as row_estimate
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'chats\_%'
  order by c.relname;
$$;

-- Prompt Studio connects with the service_role key.
grant execute on function public.list_chat_tables() to service_role;

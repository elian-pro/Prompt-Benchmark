-- ============================================================
-- Adds the `turnos` column to every existing chats_* table.
-- Lives in the SECOND Supabase project ("chats"), NOT in prompt_studio.
--
-- `historial` is a flat text blob the n8n flows build by appending
-- "User:..." / "IA:..." fragments across five separate Supabase nodes. The
-- markers land mid-line, they differ per client, and a lead who writes
-- "IA:" breaks any parser. `turnos` is the structured version, one object
-- per turn:
--
--   [{"rol":"lead","texto":"Por Facebook","ts":"..."},
--    {"rol":"bot","texto":"Claro, te explico...","estado":"activo","ts":"..."}]
--
-- Nullable and additive: rows written before the flows were updated keep a
-- null here and are read from `historial` with a tolerant parser. Nothing
-- backfills the old rows, a parser that is known to be wrong must not
-- overwrite the record it is guessing at.
--
-- New tables get the column from buildCreateChatsTableSql
-- (lib/chats-table-name.ts); this script is only for the ones that already
-- existed. Idempotent, safe to re-run.
-- Applied 2026-07-30 to all 16 tables.
-- ============================================================

do $$
declare t text;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name like 'chats\_%'
  loop
    execute format('alter table public.%I add column if not exists turnos jsonb', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

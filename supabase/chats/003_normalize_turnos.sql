-- ============================================================
-- Normalizes `turnos` when it arrives double-encoded.
-- Lives in the SECOND Supabase project ("chats"), NOT in prompt_studio.
--
-- The n8n Supabase node sends every field value as a string, so an expression
-- returning JSON.stringify([...]) lands as a jsonb STRING containing the JSON,
-- not as a jsonb array:
--
--   jsonb_typeof(turnos) -> "string"
--   turnos               -> "[{\"rol\":\"bot\",...}]"
--
-- Nothing can be queried out of that shape. This trigger unwraps it on write.
-- It is a no-op when the value already arrives as an array, so a flow that is
-- later fixed to send real JSON keeps working, and so does a hand-edited flow
-- that never gets fixed.
--
-- A malformed value is left exactly as it came instead of raising: `turnos` is
-- a convenience column, and the agents' write must never fail because of it.
-- The conversation itself is in `historial` either way.
-- Applied 2026-07-30 to all 16 tables.
-- ============================================================

create or replace function public.normalize_turnos()
returns trigger
language plpgsql
as $fn$
begin
  if jsonb_typeof(new.turnos) = 'string' then
    begin
      new.turnos := (new.turnos #>> '{}')::jsonb;
    exception when others then
      null;  -- not valid JSON inside the string: keep it, do not break the write
    end;
  end if;
  return new;
end;
$fn$;

do $$
declare t text;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name like 'chats\_%'
  loop
    execute format('drop trigger if exists turnos_normalize on public.%I', t);
    execute format(
      'create trigger turnos_normalize before insert or update on public.%I
         for each row execute function public.normalize_turnos()', t);
  end loop;
end $$;

-- Repair the rows already written double-encoded.
do $$
declare t text;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name like 'chats\_%'
  loop
    execute format(
      'update public.%I set turnos = (turnos #>> ''{}'')::jsonb
         where jsonb_typeof(turnos) = ''string''', t);
  end loop;
end $$;

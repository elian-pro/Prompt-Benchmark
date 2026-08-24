-- ============================================================
-- Point clients.chats_table at the new conversation-history database.
--
-- The history moved (August 2026) from a second Supabase project, where each
-- client had a table public.chats_<Cliente>, to a Postgres where each client
-- has a SCHEMA holding a single table `chats`. The column keeps its name and
-- its meaning ("where this client's conversations live"); what changes is the
-- value: chats_BadBoysToys becomes "Bad Boys Toys".
--
-- The mapping cannot be derived from the old value (chats_Arken_Fwagner ->
-- Fernando Wagner, chats_Sofia -> Sofía), so it is spelled out. Anything not
-- listed keeps its value and shows up in the verification query at the bottom.
--
-- Run once in the Supabase SQL Editor of the prompt_studio project.
-- ============================================================

update clients set chats_table = v.schema_name
from (values
  ('chats_Alquimia',      'Alquimia'),
  ('chats_BadBoysToys',   'Bad Boys Toys'),
  ('chats_Chapur',        'Chapur'),
  ('chats_FerSierra',     'Fernanda Sierra'),
  ('chats_Arken_Fwagner', 'Fernando Wagner'),
  ('chats_RamonLosa',     'Ramon Losa'),
  ('chats_SIWCopackers',  'SIW Copacker'),
  ('chats_Sofia',         'Sofía'),
  ('chats_Valcasa',       'Valcasa'),
  ('chats_SamuelMaya',    'Samuel Maya'),
  ('chats_Vero_Lozano',   'Verónica Lozano Hermosillo'),
  ('chats_Acalai',        'Acalai'),
  ('chats_Kuyabeh',       'Grupo de la Torre')
) as v(old_table, schema_name)
where clients.chats_table = v.old_table;

-- Maraya was dropped as a client and its conversations were not migrated, so
-- there is no schema to point at. Null means "no history connected", which is
-- the honest state and what the Library panel already knows how to show.
update clients set chats_table = null where chats_table = 'chats_Maraya';

-- Verification: should return no rows. Anything left starting with chats_ is a
-- client whose history was not remapped and whose panel would fail to read.
select id, name, chats_table
  from clients
 where chats_table like 'chats\_%';

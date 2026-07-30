-- ============================================================
-- Replay: a real conversation marked as a case.
-- Run once in the Supabase SQL Editor of the prompt_studio project.
--
-- When a client reports that the bot answered badly, the conversation that
-- proves it lives in the OTHER Supabase project ("chats"), which this app
-- treats as read only: it is the agents' production database. So the mark
-- lives here instead, next to the versions it is about.
--
-- Two columns carry the weight:
--
--   version_id   what the prompt was when the case was filed. Without it you
--                cannot tell whether a case is already fixed.
--   turno_index  WHERE it failed, taken from the turn the user tagged. Without
--                it, replaying the case means re-reading the whole
--                conversation by hand to find the moment again.
--
-- The snapshots are not redundant with the chats DB: the agents overwrite
-- those rows as the conversation continues, and a client's table can be
-- rotated or renamed. A case that changes under you is not evidence.
-- ============================================================

create table if not exists conversation_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Where it came from in the chats project. Kept as plain columns, not a
  -- foreign key: that database is a separate project.
  chats_table text not null,
  row_id bigint not null,
  id_de_kommo text,
  conversation_at timestamptz,

  -- Frozen copies, see the note above.
  historial_snapshot text,
  turnos_snapshot jsonb,

  -- The prompt this conversation is judged against, and where it broke.
  version_id uuid references versions(id) on delete set null,
  turno_index integer,

  nota text not null,
  editor_session_id uuid references chat_sessions(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists conversation_cases_client_idx
  on conversation_cases (client_id, created_at desc);

-- The same conversation can be filed more than once (a second problem, or the
-- same one after an edit), so row_id is deliberately not unique.

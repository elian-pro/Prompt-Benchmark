-- ============================================================
-- ZEBRA · PROMPT STUDIO — Migration 008
-- Lab: Playground sessions (Sprint 6, T2)
-- Run once in Supabase SQL Editor
-- ============================================================

-- A Playground session freezes a client + version's prompt (same
-- production-fidelity snapshot idea as an Adversarial run), then the user
-- converses with it directly in the `human` role, playing the lead. No
-- persona, no judge, no turn limit. `editor_session_id` will be filled in by
-- the notes-to-Editor handoff (Sprint 6, T4).

create table demo_sessions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  version_id uuid references versions(id) on delete set null,
  version_number_snapshot text not null,
  prompt_snapshot text not null,
  status text not null default 'active'
    check (status in ('active', 'sent_to_editor')),
  editor_session_id uuid references chat_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_demo_sessions_client on demo_sessions (client_id, created_at desc);

create trigger trg_demo_sessions_updated_at
  before update on demo_sessions
  for each row execute function set_updated_at();

create table demo_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references demo_sessions(id) on delete cascade,
  turn_number int not null,
  role text not null check (role in ('human', 'bot')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_demo_messages_session on demo_messages (session_id, turn_number asc);

alter table demo_sessions enable row level security;
alter table demo_messages enable row level security;

create policy "authenticated_all" on demo_sessions
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on demo_messages
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select count(*) from demo_sessions;  -- debería dar 0
-- ============================================================

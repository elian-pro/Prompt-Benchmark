-- ============================================================
-- ZEBRA · PROMPT STUDIO — Migration 009
-- Lab: Playground notes (Sprint 6, T3)
-- Run once in Supabase SQL Editor
-- ============================================================

-- Feedback the user writes while conversing in a Playground session,
-- optionally tagging one or more messages from that same conversation.
-- A note with an empty message_ids array is a general note (no tags).
-- These notes are what "Enviar al Editor" (Sprint 6, T4) turns into the
-- first message of an Editor session.

create table demo_notes (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references demo_sessions(id) on delete cascade,
  text text not null,
  message_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_demo_notes_session on demo_notes (session_id, created_at asc);

create trigger trg_demo_notes_updated_at
  before update on demo_notes
  for each row execute function set_updated_at();

alter table demo_notes enable row level security;

create policy "authenticated_all" on demo_notes
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select count(*) from demo_notes;  -- debería dar 0
-- ============================================================

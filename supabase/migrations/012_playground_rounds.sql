-- ============================================================
-- ZEBRA · PROMPT STUDIO · Migration 012
-- Playground: conversation rounds (Sprint 8, T1)
-- Run once in the Supabase SQL Editor
-- ============================================================
--
-- Lets a Playground session be reset ("empezar de cero") and its active
-- version switched, without losing notes. Instead of deleting messages on
-- reset (which would leave notes pointing at rows that no longer exist), we
-- version the conversation into rounds: reset bumps current_round, the chat
-- view shows only the current round, and old messages stay in the table so a
-- note's referenced-message preview keeps working. Notes remain session-scoped
-- (not round-scoped), so they persist across resets. See
-- docs/SPRINT-8-playground-plan.md section 3.

-- The session's active round. Reset and version-switch both bump this.
alter table demo_sessions
  add column if not exists current_round int not null default 1;

-- Which round a message belongs to. The chat shows current_round; older
-- rounds stay for note previews.
alter table demo_messages
  add column if not exists round int not null default 1;

-- Which version produced each message. Denormalized so a transcript stays
-- self-documenting (useful if a session's version changed between rounds).
-- Backfilled from the session's snapshot for existing rows.
alter table demo_messages
  add column if not exists version_number_snapshot text;

update demo_messages m
  set version_number_snapshot = s.version_number_snapshot
  from demo_sessions s
  where m.session_id = s.id
    and m.version_number_snapshot is null;

create index if not exists idx_demo_messages_session_round
  on demo_messages (session_id, round, turn_number asc);

-- ============================================================
-- DONE. Verifica con:
--   select current_round from demo_sessions limit 1;   -- debería dar 1
--   select distinct round from demo_messages;          -- solo 1 por ahora
-- ============================================================

-- ============================================================
-- ZEBRA · PROMPT STUDIO — Migration 010
-- Editor: trace back to the Playground session that started it
-- (Sprint 6, T4 — "Enviar al Editor" handoff)
-- Run once in Supabase SQL Editor
-- ============================================================

-- demo_sessions.editor_session_id already traces Playground -> Editor.
-- This is the reverse link, so an Editor session created via "Enviar al
-- Editor" can show where its first message came from.

alter table chat_sessions
  add column if not exists source_demo_session_id uuid
    references demo_sessions(id) on delete set null;

create index if not exists idx_chat_sessions_source_demo
  on chat_sessions (source_demo_session_id);

-- ============================================================
-- DONE.
-- ============================================================

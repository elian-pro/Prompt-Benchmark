-- ============================================================
-- S2-T1 — Per-message token usage.
-- Stores tokensIn / tokensOut returned by the provider router so the
-- Editor's per-session token counter survives reopening a conversation.
-- Run once in the Supabase SQL Editor.
-- ============================================================

alter table chat_messages
  add column if not exists tokens_in integer,
  add column if not exists tokens_out integer;

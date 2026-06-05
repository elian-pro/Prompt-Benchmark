-- ============================================================
-- S1-T10 — Manual editor working draft.
-- Adds a per-client draft buffer the manual editor autosaves into.
-- Run once in the Supabase SQL Editor.
-- ============================================================

alter table clients
  add column if not exists draft_content text;

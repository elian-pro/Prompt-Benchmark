-- ============================================================
-- Selectable-options block: persisted answer.
-- Stores the user's structured selection for a message that answers an
-- options block, so reopening the block after a reload shows exactly which
-- options were chosen. UI-only data: the human-readable summary already
-- enters the conversation as a normal user message. Nullable, defaults null,
-- so all existing rows and non-options messages are unaffected.
-- Run once in the Supabase SQL Editor.
-- ============================================================

alter table chat_messages
  add column if not exists answer jsonb;

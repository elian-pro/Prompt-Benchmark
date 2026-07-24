-- ============================================================
-- Link a client to its conversation-history table in the "chats" DB.
-- The second Supabase project ("chats") stores each client's real lead
-- conversations in a per-client table named chats_<Cliente>. Client names do
-- not map cleanly to those table names, so we store the mapping explicitly.
-- Nullable: a null value means "no history connected yet" (the Library panel
-- shows the disconnected state and lets you pick a table). New clients get an
-- auto-suggested match by name; existing ones are connected by hand.
-- Run once in the Supabase SQL Editor of the prompt_studio project.
-- ============================================================

alter table clients
  add column if not exists chats_table text;

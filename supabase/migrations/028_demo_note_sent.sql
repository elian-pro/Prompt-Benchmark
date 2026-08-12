-- ============================================================
-- Demo: a report knows whether it already reached the Editor.
-- Run once in the Supabase SQL Editor of the prompt_studio project.
--
-- Until now "send to the Editor" was a per conversation act, so the batch was
-- whatever one visitor happened to report and nothing needed to be remembered
-- afterwards. With a per client inbox the same approved note is reachable from
-- two places, and the one thing that must not happen is the same instruction
-- travelling twice and the user editing the prompt for it twice.
--
-- Nullable, no backfill. Notes approved before this migration count as not sent
-- yet, which means one batch may repeat what was already handed over once. That
-- is a single review, not a data problem, and inventing a sent date for rows
-- nobody recorded would be worse.
--
-- `editor_session_id` is `on delete set null` for the same reason
-- `chat_sessions.source_demo_session_id` is: deleting an Editor conversation
-- must not delete the client's report, and losing the trace is acceptable while
-- losing the fact that it was sent is not.
-- ============================================================

alter table demo_notes
  add column if not exists sent_to_editor_at timestamptz,
  add column if not exists editor_session_id uuid references chat_sessions(id) on delete set null;

-- What the inbox and both handoff routes ask for: the approved reports of a
-- conversation that are still waiting to be sent. Partial so it stays small.
create index if not exists demo_notes_sendable_idx
  on demo_notes (session_id)
  where status = 'approved' and sent_to_editor_at is null;

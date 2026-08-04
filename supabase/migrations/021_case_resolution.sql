-- ============================================================
-- Replay: whether a case passes, and on which version.
-- Run once in the Supabase SQL Editor of the prompt_studio project.
--
-- "Passes" is not a property of the case, it is a property of a case AND a
-- version: the same conversation can be fixed by v1.5 and broken again by
-- v1.6. So the verdict stores which version earned it, and any later replay
-- can disagree by clearing it.
--
-- Deliberately a human verdict, set after reading both replies side by side.
-- There is no automatic judge yet: with a handful of cases, a person is more
-- reliable than a judge that can be wrong in a way nobody notices.
-- ============================================================

alter table conversation_cases
  add column if not exists resolved_version_id uuid references versions(id) on delete set null,
  add column if not exists resolved_at timestamptz;

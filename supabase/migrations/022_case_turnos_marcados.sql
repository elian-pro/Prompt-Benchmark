-- ============================================================
-- Replay: a case can mark more than one message.
-- Run once in the Supabase SQL Editor of the prompt_studio project.
--
-- A note in the Playground tags several messages at once, and a real
-- conversation is no different: "asked for the budget here, and then ignored
-- the answer here" is one problem with two pieces of evidence.
--
-- `turno_index` stays, and keeps its old meaning: the single point the replay
-- cuts the history at. It is derived from the marked turns (the first bot turn
-- among them), because a replay can only answer one turn. `turnos_marcados`
-- is everything the note points at, for the pins in the transcript and for
-- the handoff message.
--
-- Existing cases are backfilled from the column they already had.
-- ============================================================

alter table conversation_cases
  add column if not exists turnos_marcados integer[] not null default '{}';

update conversation_cases
  set turnos_marcados = array[turno_index]
  where turno_index is not null
    and turnos_marcados = '{}';

-- A case with no editor session yet is a saved note that has not been handed
-- off. Nothing to add for that, it is what a null editor_session_id means.

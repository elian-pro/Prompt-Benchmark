-- ============================================================
-- The client's report leads with the fix, not the complaint (Sprint 18).
-- Run once in the Supabase SQL Editor of the prompt_studio project.
--
-- `demo_notes.text` ("qué estuvo mal") was required and `expected` ("qué debió
-- responder") was optional. In practice it is the other way round: knowing what
-- the bot should have said is what actually gets the prompt edited, while the
-- complaint is context you can usually infer from the tagged message.
--
-- So `text` becomes nullable. Nothing else changes: existing rows keep their
-- text, the Playground still writes one, and a client's report now needs
-- `expected` instead. The check lives in the Zod schema rather than here,
-- because "at least one of the two" differs by who is writing (the Playground
-- has a single free text field and no `expected` at all).
-- ============================================================

alter table demo_notes alter column text drop not null;

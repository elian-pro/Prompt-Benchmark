-- ============================================================
-- Editable system prompts (Editor / Creator / Adversarial judge).
--
-- The app ships each persona as a code constant (lib/prompts/*). A row here
-- OVERRIDES that constant at runtime: when a row exists for a role, the app
-- uses its `content`; when absent, it falls back to the code default. This is
-- how "Restaurar original" works — it deletes the row.
--
-- Only the three editable personas live here (one row max per role); the
-- dynamic parts the app appends at runtime (the client's draft in Editor, the
-- reference prompt in Creator) are NOT stored — they're still assembled per
-- request. Run once in the Supabase SQL Editor.
-- ============================================================
create table if not exists prompt_overrides (
  role text primary key check (role in ('editor', 'creator', 'judge')),
  content text not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every change (mirrors the pattern used elsewhere).
create trigger trg_prompt_overrides_updated_at
  before update on prompt_overrides
  for each row execute function set_updated_at();

-- Defense in depth, mirroring the rest of the schema (app uses service_role).
alter table prompt_overrides enable row level security;
create policy "authenticated_all" on prompt_overrides
  for all to authenticated using (true) with check (true);

-- ============================================================
-- ZEBRA · PROMPT STUDIO — Migration 026
-- Avisos en Google Chat cuando un cliente deja un reporte (Sprint 18)
-- Run once in Supabase SQL Editor
-- ============================================================

-- The in-app bell only reaches someone with the tab open. The team lives in
-- Google Chat, so a client's report goes there too.
--
-- Only the CHOSEN SPACE lives here. The service account credentials are env
-- vars (GOOGLE_CHAT_CLIENT_EMAIL / GOOGLE_CHAT_PRIVATE_KEY), like every other
-- server secret: a key from Google Cloud is not something the team edits from
-- a settings page, and keeping it out of the database means no third kind of
-- encrypted column and no rotation hazard. The space is a preference, not a
-- secret.
--
-- Same singleton shape as composer_settings (016): `id` is always true, so the
-- primary key guarantees exactly one row for the whole shared workspace.

create table google_chat_settings (
  id boolean primary key default true check (id),
  -- "spaces/AAAA…". Null means the notifications are off.
  space_name text,
  -- The label, cached so Settings renders without calling Google.
  space_display_name text,
  updated_at timestamptz not null default now()
);

insert into google_chat_settings (id) values (true);

create trigger trg_google_chat_settings_updated_at
  before update on google_chat_settings
  for each row execute function set_updated_at();

alter table google_chat_settings enable row level security;
create policy "authenticated_all" on google_chat_settings
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select * from google_chat_settings;
-- ============================================================

-- ============================================================
-- ZEBRA · PROMPT STUDIO — Migration 016
-- Smart Paste (Sprint 15): shared composer settings
-- Run once in Supabase SQL Editor
-- ============================================================

-- No per-user accounts in this app (shared 2-person workspace, see
-- CLAUDE.md), so this is one shared row for the whole team rather than a
-- per-user setting. Singleton pattern: `id` is always `true`, and the
-- primary key guarantees only one row can ever exist.

create table composer_settings (
  id boolean primary key default true check (id),
  smart_paste_enabled boolean not null default true,
  smart_paste_threshold int not null default 1000
    check (smart_paste_threshold between 200 and 10000),
  updated_at timestamptz not null default now()
);

insert into composer_settings (id) values (true);

create trigger trg_composer_settings_updated_at
  before update on composer_settings
  for each row execute function set_updated_at();

alter table composer_settings enable row level security;
create policy "authenticated_all" on composer_settings
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select * from composer_settings;
-- ============================================================

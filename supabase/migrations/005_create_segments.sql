-- ============================================================
-- Saved client segments (presets) for the segment picker.
-- Free-text segments still live on clients.segment; this table only stores
-- the reusable chips shown in the picker. Seeded with the three defaults.
-- Run once in the Supabase SQL Editor.
-- ============================================================
create table if not exists segments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness so "Inmo" and "inmo" don't both get saved.
create unique index if not exists segments_name_lower_idx on segments (lower(name));

-- Defense in depth, mirroring the rest of the schema (app uses service_role).
alter table segments enable row level security;
create policy "authenticated_all" on segments
  for all to authenticated using (true) with check (true);

insert into segments (name) values ('Inmo'), ('Foods'), ('Wellness')
  on conflict do nothing;

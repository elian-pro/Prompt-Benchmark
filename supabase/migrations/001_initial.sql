-- ============================================================
-- ZEBRA · PROMPT STUDIO — Initial Supabase migration
-- Run once in Supabase SQL Editor
-- ============================================================

-- 1. Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- 2. Library (clients + versions)
-- ============================================================

create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  segment text,
  location text,
  notes text,
  is_legacy boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_clients_archived on clients (archived_at);
create index idx_clients_is_legacy on clients (is_legacy);

create table versions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  version_number text not null,
  content text not null,
  is_production boolean not null default false,
  bump_type text check (bump_type in ('major', 'minor', 'imported')),
  source text check (source in ('manual', 'editor_chat', 'creator_chat', 'imported')),
  source_session_id uuid,
  created_at timestamptz not null default now()
);

create index idx_versions_client on versions (client_id, created_at desc);

-- One production version per client at most
create unique index unique_production_per_client
  on versions (client_id) where is_production = true;

-- ============================================================
-- 3. Version limit trigger (max 5 per client, protect production)
-- ============================================================

create or replace function enforce_version_limit()
returns trigger
language plpgsql
as $$
declare
  version_count int;
  oldest_id uuid;
begin
  select count(*) into version_count from versions where client_id = new.client_id;

  if version_count > 5 then
    select id into oldest_id
    from versions
    where client_id = new.client_id
      and is_production = false
      and id != new.id
    order by created_at asc
    limit 1;

    if oldest_id is not null then
      delete from versions where id = oldest_id;
    else
      raise exception 'No se puede agregar nueva versión: todas las existentes están protegidas como producción';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_version_limit
  after insert on versions
  for each row execute function enforce_version_limit();

-- ============================================================
-- 4. Chat sessions (Editor + Creator)
-- ============================================================

create table chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  type text not null check (type in ('editor', 'creator')),
  title text,
  status text not null default 'active'
    check (status in ('active', 'finalized', 'abandoned')),
  base_version_id uuid references versions(id) on delete set null,
  current_draft_content text,
  final_version_id uuid references versions(id) on delete set null,
  model_provider_id uuid,
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index idx_chat_sessions_client on chat_sessions (client_id, status);

create table chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create index idx_chat_messages_session on chat_messages (session_id, created_at asc);

create table uploads (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references chat_sessions(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index idx_uploads_expires on uploads (expires_at);

-- ============================================================
-- 5. Adversarial Lab
-- ============================================================

create table runs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  version_id uuid references versions(id) on delete set null,
  version_number_snapshot text not null,
  prompt_snapshot text not null,
  preset text not null
    check (preset in ('caotico', 'evasivo', 'manipulador', 'interrogador', 'comprador')),
  intensity int not null check (intensity between 1 and 3),
  max_turns int not null default 12,
  starter text not null default 'bot' check (starter in ('bot', 'lead')),
  bot_config jsonb not null,
  lead_config jsonb not null,
  judge_config jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'stopped', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_runs_client on runs (client_id, created_at desc);

create table run_messages (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references runs(id) on delete cascade,
  turn_number int not null,
  role text not null check (role in ('bot', 'lead')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_run_messages_run on run_messages (run_id, turn_number asc);

create table reports (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null unique references runs(id) on delete cascade,
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  edge_cases jsonb default '[]'::jsonb,
  scope_disclaimer text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. Providers (multi-proveedor LLM)
-- ============================================================

create table providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  adapter_type text not null
    check (adapter_type in ('openai_compat', 'anthropic', 'google', 'openrouter')),
  base_url text,
  api_key_encrypted text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table provider_models (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references providers(id) on delete cascade,
  model_name text not null,
  display_name text,
  enabled boolean not null default true,
  unique (provider_id, model_name)
);

create table role_defaults (
  id uuid primary key default uuid_generate_v4(),
  role text not null unique
    check (role in ('test_bot', 'adversarial_lead', 'judge', 'editor', 'creator')),
  provider_id uuid not null references providers(id),
  model_name text not null,
  temperature numeric(3,2) default 0.70,
  top_p numeric(3,2),
  max_tokens int default 4096,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 7. Updated_at trigger (reusable)
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create trigger trg_chat_sessions_updated_at
  before update on chat_sessions
  for each row execute function set_updated_at();

create trigger trg_providers_updated_at
  before update on providers
  for each row execute function set_updated_at();

create trigger trg_role_defaults_updated_at
  before update on role_defaults
  for each row execute function set_updated_at();

-- ============================================================
-- 8. Cleanup function for expired uploads (run via pg_cron daily)
-- ============================================================

create or replace function cleanup_expired_uploads()
returns void
language plpgsql
as $$
begin
  delete from uploads where expires_at < now();
end;
$$;

-- To schedule daily at 3am UTC (enable pg_cron extension first in Dashboard > Database > Extensions):
-- select cron.schedule('cleanup-uploads', '0 3 * * *', 'select cleanup_expired_uploads()');
-- NOTE: this only deletes DB rows. The application code must also delete the
-- actual file from Supabase Storage bucket 'studio-uploads' when handling uploads.

-- ============================================================
-- 9. Seed data: default providers (sin keys — se configuran en Settings)
-- ============================================================

insert into providers (name, adapter_type, base_url, enabled) values
  ('OpenAI',        'openai_compat', 'https://api.openai.com/v1',   false),
  ('Anthropic',     'anthropic',     null,                          false),
  ('DeepSeek',      'openai_compat', 'https://api.deepseek.com/v1', false),
  ('Google Gemini', 'google',        null,                          false);

-- ============================================================
-- 10. Row Level Security (workspace compartido, equipo de 2)
-- ============================================================

alter table clients          enable row level security;
alter table versions         enable row level security;
alter table chat_sessions    enable row level security;
alter table chat_messages    enable row level security;
alter table uploads          enable row level security;
alter table runs             enable row level security;
alter table run_messages     enable row level security;
alter table reports          enable row level security;
alter table providers        enable row level security;
alter table provider_models  enable row level security;
alter table role_defaults    enable row level security;

create policy "authenticated_all" on clients
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on versions
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on chat_sessions
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on chat_messages
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on uploads
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on runs
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on run_messages
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on reports
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on providers
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on provider_models
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on role_defaults
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 11. Storage bucket setup (NO se hace en SQL — usar la UI)
-- ============================================================

-- En Supabase Dashboard > Storage:
--   1. Create new bucket: name="studio-uploads", public=false, file_size_limit=10MB
--   2. Allowed MIME types: application/pdf, image/png, image/jpeg, image/webp,
--      text/markdown, text/plain, application/vnd.openxmlformats-officedocument.wordprocessingml.document
--   3. RLS policy on storage.objects: "authenticated_all" — for all authenticated users

-- ============================================================
-- DONE. Verifica con: select count(*) from providers;  -- debería dar 4
-- ============================================================

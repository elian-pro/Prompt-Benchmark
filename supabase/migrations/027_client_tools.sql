-- ============================================================
-- ZEBRA · PROMPT STUDIO · Migration 027
-- Agent tools per client (Playground and client demo link)
-- Run once in the Supabase SQL Editor of the prompt_studio project
-- ============================================================
--
-- A client's agent in production (n8n) is not just a prompt: it has HTTP tools
-- that hit the client's own Supabase RPCs to read their catalog. Testing that
-- prompt without those tools tests a different agent, one that has to invent
-- the data or dodge the question.
--
-- These rows are what the bot under test is handed as callable tools. They are
-- per client and outlive any single conversation, so they are configured once
-- in the Library instead of on every new Playground session.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The tools themselves.
--    `name` and `description` are what the MODEL sees (n8n's toolDescription);
--    they decide whether it calls the tool at all, so they are as much part of
--    the prompt as the prompt is.
--    `params` is what the model fills in, the equivalent of n8n's $fromAI:
--      [{ "name": "termino", "description": "...", "type": "string" }]
--    The request body is body_template merged with those arguments, which for
--    a PostgREST RPC is exactly its argument object.
--    Only the headers are encrypted (AES-256-GCM, lib/crypto.ts): they carry
--    the client's service_role key. The URL stays readable so the Library can
--    show the host and the allowed-host list can be audited in SQL.
-- ------------------------------------------------------------
create table client_tools (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  -- OpenAI requires ^[a-zA-Z0-9_-]{1,64}$ for a function name.
  name text not null check (name ~ '^[a-zA-Z0-9_-]{1,64}$'),
  description text not null,
  url text not null,
  headers_encrypted text not null,
  params jsonb not null default '[]'::jsonb,
  body_template jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Two tools with the same name would be ambiguous to the model.
  unique (client_id, name)
);

create index idx_client_tools_client on client_tools (client_id) where enabled;

create trigger trg_client_tools_updated_at
  before update on client_tools
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 2. What the tools did on a given turn.
--    Diagnostics only, and only for the Playground: a tool that returns an
--    empty list and a tool the model never called produce the same bubble, and
--    telling those two apart is the whole point of the Playground. It is NOT
--    part of the history the model sees (that is rebuilt from the rows in
--    lib/demo-turn.ts), same idea as chat_messages.answer in migration 017.
--    Left null on demo-link sessions: the client should not see the name of an
--    internal RPC or a slice of its response.
-- ------------------------------------------------------------
alter table demo_messages
  add column if not exists tool_calls jsonb;

-- ------------------------------------------------------------
-- 3. RLS: defense in depth, mirroring the rest of the schema. The app talks to
--    Supabase with service_role, which bypasses RLS.
-- ------------------------------------------------------------
alter table client_tools enable row level security;

create policy "authenticated_all" on client_tools
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select count(*) from client_tools;  -- debería dar 0
-- ============================================================

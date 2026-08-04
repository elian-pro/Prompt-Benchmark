-- ============================================================
-- Demo: a shareable test link for the client (Sprint 18, T0).
-- Run once in the Supabase SQL Editor of the prompt_studio project.
--
-- Until now the client tested their agent in n8n and sent feedback back as
-- WhatsApp audios and screenshots, later as an editable Google Doc. Both lose
-- the conversation the feedback is about. A demo link is the Playground with
-- the admin half removed: the client converses, tags messages, writes what is
-- wrong and what the bot should have answered, and every word stays here.
--
-- Three ideas carry the design:
--
--   demo_links          one link per client and version. The prompt is frozen
--                       the same way a Playground session freezes it, so a
--                       round of testing is always about a known version.
--   demo_sessions.link_id  a link's conversations reuse the Playground tables
--                       whole. A null link_id is a session Carlos started
--                       himself, which is what every existing row is.
--   demo_notes.status   a client's note is a proposal. Nothing reaches the
--                       Editor until Carlos approves it.
--
-- The visitor columns are the evidence trail. When a client later disputes an
-- edit, the answer is the conversation itself: this message, this date, this
-- IP, this device. No name is collected, on purpose.
-- ============================================================

create table if not exists demo_links (
  id uuid primary key default gen_random_uuid(),

  -- What goes in the URL. Random, not sequential: guessing a token is the
  -- only way in, since these routes have no login behind them.
  token text not null unique,

  client_id uuid not null references clients(id) on delete cascade,

  -- Same frozen snapshot as demo_sessions. A link outlives the version it was
  -- cut from, and the notes have to stay readable against the prompt that
  -- actually produced them.
  version_id uuid references versions(id) on delete set null,
  version_number_snapshot text not null,
  prompt_snapshot text not null,
  opening_message text,

  -- Free label so a client with several rounds can tell them apart.
  label text,

  status text not null default 'active'
    check (status in ('active', 'closed')),

  -- Hard caps. This is the first endpoint in the project that spends money on
  -- a model without a login in front of it.
  max_sessions integer not null default 25,
  max_messages integer not null default 60,

  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists demo_links_client_idx
  on demo_links (client_id, created_at desc);

-- ------------------------------------------------------------
-- demo_sessions: a conversation can now belong to a link.
-- ------------------------------------------------------------

alter table demo_sessions
  add column if not exists link_id uuid references demo_links(id) on delete cascade;

alter table demo_sessions add column if not exists visitor_id text;
alter table demo_sessions add column if not exists visitor_ip text;
alter table demo_sessions add column if not exists visitor_user_agent text;
alter table demo_sessions add column if not exists last_seen_at timestamptz;

create index if not exists demo_sessions_link_idx
  on demo_sessions (link_id, created_at desc);

-- One conversation per device per link. Makes "create or resume" a single
-- upsert instead of a read-then-write race when the client double clicks.
create unique index if not exists demo_sessions_link_visitor_idx
  on demo_sessions (link_id, visitor_id)
  where link_id is not null;

-- ------------------------------------------------------------
-- demo_notes: who wrote it, and whether it is approved.
-- ------------------------------------------------------------

-- The defaults describe the rows that already exist: notes Carlos wrote in the
-- Playground, which need no approval. Only a client's note starts pending.
alter table demo_notes add column if not exists source text not null default 'admin';
alter table demo_notes add column if not exists status text not null default 'approved';

-- "What the bot should have answered". Optional, and the single most useful
-- field when editing the prompt afterwards. `text` keeps its meaning: what is
-- wrong.
alter table demo_notes add column if not exists expected text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demo_notes_source_check'
  ) then
    alter table demo_notes add constraint demo_notes_source_check
      check (source in ('admin', 'client'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'demo_notes_status_check'
  ) then
    alter table demo_notes add constraint demo_notes_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- Drives the pending badge, which polls. Partial so it stays small.
create index if not exists demo_notes_pending_idx
  on demo_notes (created_at desc)
  where status = 'pending';

-- ------------------------------------------------------------
-- Same posture as every other table here: RLS on, one policy for
-- authenticated. The app reaches this through the service_role client, which
-- bypasses RLS; leaving it off would expose every link token to anyone holding
-- the publishable key.
-- ------------------------------------------------------------

alter table demo_links enable row level security;

drop policy if exists authenticated_all on demo_links;
create policy authenticated_all on demo_links
  for all to authenticated using (true) with check (true);

-- ============================================================
-- DONE. Verifica con: select count(*) from demo_links;  -- debería dar 0
-- ============================================================

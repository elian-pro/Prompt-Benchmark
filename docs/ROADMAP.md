# Roadmap

Status: ✅ done · 🔨 in progress · ⏳ planned

## Phase 0 — Foundation (pre-iteration)

- ✅ Next.js + TS scaffold
- ✅ `.gitignore` protecting `.env`, `.secrets/`, `/data`
- ✅ Basic Settings page with key paste (will be refactored in Sprint 1)

## Phase 1 — Re-spec (this iteration)

- ✅ Decision: rename to ZEBRA · Prompt Studio (4 sections, not just stress test)
- ✅ Decision: multi-provider LLM architecture (4 adapter types)
- ✅ Decision: Library + versioning model (max 5 per client, production protected)
- ✅ Decision: Supabase as backing store; EasyPanel Basic Auth for access
- ✅ Supabase schema designed and migration `001_initial.sql` ready to deploy
- ✅ Visual preview approved by stakeholder

## Sprint 1 — Settings + Library ✅

Build the foundation: providers configured, prompts importable, manual
editing with version history. Detailed tickets in `docs/SPRINT-1.md`.

**Definition of done**: can configure providers in Settings, import an
existing prompt from production, make a manual edit, finalize as new
version, copy to clipboard, see version count cap at 5.

## Sprint 2 — Editor (chat-driven edits) ✅

Chat with Claude Opus to make guided edits to a prompt. File uploads with
TTL of 7 days. Conversation persistence (reopenable). "Finalizar edición"
button commits the current state as a new minor version.

**Includes**: chat UI, file upload to Storage, system prompt for the
ingeniero-de-prompts persona (from the existing manual template),
streaming responses, token counter visible per session.

## Sprint 3 — Creator (chat-driven creation) ✅

Chat with Claude Opus to build a new prompt from scratch using an existing
prompt as architectural reference and a brief as content source.
Clarifying questionnaire before construction (only blocking questions,
grouped by category).

**Includes**: brief upload, base-prompt picker (reads from Library), the
questionnaire UX, the "arquitectura trasladada / contenido extraído /
pendiente" report appended to the new version.

## Sprint 4 — Adversarial Lab ✅

Reintegrate the original stress-test functionality on top of the new
versioning model. Tests now run against a specific version selected from
Library. Judge produces structured JSON report with the 8-category
taxonomy.

**Includes**: 5 adversarial personas (data, not code), live turn-by-turn
rendering, judge call after conversation ends, report view, snapshot of
prompt content into the run row so reports survive version deletion.

## Sprint 5 — Visual polish ✅

Apply the full Zebra design system. Dark/light mode toggle. NEW and
NEW VERSION badges. Two-step delete with typed-confirmation. Empty
states. Loading states. Mobile responsive. Animation polish. Tickets
archived in `docs/SPRINT-5-archive.md`.

## Sprint 6 — Lab: Playground + notes-to-Editor handoff ✅

The Adversarial-only Lab becomes a hub with two modes: the existing IA vs IA
run, and a new Playground where the user converses with a client's prompt
themselves, tags messages, writes feedback notes, and sends them straight
into an Editor session. Plan and tickets in `docs/SPRINT-6-archive.md`.

## Sprint 7: n8n prompt sync ✅

Clients can be bound to their n8n AI Agent node, by API connection or
manually. Promoting a version pushes the prompt into the node after a diff
confirmation, with drift badges, sync history and revert. Migration
`011_n8n_sync.sql`. Plan in `docs/N8N-SYNC-PLAN.md`, behavior documented in
`docs/SPEC.md` and `docs/ARCHITECTURE.md`.

## Sprint 8: Playground redesign ✅

Rounds model (`012_playground_rounds.sql`) so a conversation can be reset
without losing notes, version switching inside a session, live note card
with the referenced bubbles, notes in their own section, and WhatsApp style
bubble splitting. Archived in `docs/SPRINT-8-archive.md`.

## Sprint 9: Editor fixes ✅

Root cause fix for the truncated prompt: sentinel delimiters
(`===PROMPT ACTUALIZADO===`) replace the fenced block, so client prompts
containing their own fences survive extraction. Plus target version number
visible in the draft, bounded change summary, "NEW" badge on Ver borrador,
promote to production from the Editor, and scroll to bottom button.
Archived in `docs/SPRINT-9-archive.md`.

## Sprint 10: in-app Google login ✅

"Entrar con Google" owned by the app, restricted to
`@zebradigital.marketing` accounts and enforced server side in
`middleware.ts`. Replaces the EasyPanel HTTP Basic Auth perimeter.

## Sprint 11: judge context and lead brief ✅

A run can carry an optional lead brief so the simulated lead stays coherent,
and the judge receives the bot's prompt as labeled context.
`013_add_lead_brief_to_runs.sql`.

## Sprint 13: n8n host tag ✅

Clients record where their agent's n8n lives (`014_add_n8n_host_to_clients.sql`)
and Library cards show it as a yellow "n8n Zebra" / "n8n propio" tag.

## Sprint 14: Playground opening message ✅

An optional opening bot message per Playground session, replayed at the
start of every round and editable after the chat has started.
`015_add_opening_message_to_demo_sessions.sql`.

## Sprint 15: Smart Paste ✅

Pasting a long block of text into the Editor or Creator composer turns it
into an attachment instead of flooding the input. Threshold configurable in
Settings (`016_composer_settings.sql`).

## Sprint 16: client provisioning ✅

Creating a client can now duplicate the n8n template flow as
`IA Mensajes <Cliente>` (created disabled, its AI Agent node auto-bound) and
create the `chats_<Cliente>` history table in the chats project. Both are
checkboxes in the modal, both are idempotent, and both can be retried from the
client detail page when they fail. Template picked per n8n connection
(`019_n8n_template_workflow.sql`); the table DDL goes through the Supabase
Management API from `lib/chats-admin.ts`. Plan in
`docs/SPRINT-16-provisioning-plan.md`.

## Post Sprint 15 (unnumbered work) ✅

Shipped without a sprint plan of its own, documented in `docs/SPEC.md`:
selectable options blocks in Editor/Creator chat
(`017_add_answer_to_chat_messages.sql`), conversation history viewer per
client (`018_add_chats_table_to_clients.sql`), Playground conversation
delete, consultable error log, and turns that keep running after the client
leaves. Stream resilience hotfix in
`docs/HOTFIX-creator-editor-stream-timeout.md`.

> There is no Sprint 12. The numbering skips it.

## Sprint 17 — Replay (real conversations as cases) ⏳

A third Lab mode, after IA vs IA and Playground: the lead is a real one and
the conversation already happened. Find the conversation that failed, mark it
as a case, edit the prompt, then re-run that same turn against the new version
to see whether the problem is gone. Plan in
`docs/SPRINT-17-history-cases-plan.md`.

Groundwork already shipped: the `turnos jsonb` column on the chats tables, its
normalizing trigger, and the n8n flows that write it. Replaying a turn
faithfully needs the bot's own JSON envelopes, which only `turnos` can
reconstruct.

**Definition of done**: a client reports a bad reply, Carlos finds that
conversation by its Kommo id, reads it as a chat, marks the offending turn,
lands in the Editor with the context loaded, and after editing sees the old
and new replies side by side. No screenshots.

---

## Future (not in current scope)

- Batch adversarial runs (multiple personas in parallel).
- Cross-client analytics (which failure modes are most common across
  clients).
- Diff view between any two arbitrary versions (currently only sequential
  diffs are easy).
- Bulk import (paste a JSON / upload a zip with one prompt per client).
- A judge/report step over Playground conversations (deferred at Sprint 6
  planning, see `docs/SPRINT-6-archive.md`).

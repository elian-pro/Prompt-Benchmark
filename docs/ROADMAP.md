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

---

## Future (not in current scope)

- Direct API integration with n8n (auto-publish to nodes).
- Batch adversarial runs (multiple personas in parallel).
- Cross-client analytics (which failure modes are most common across
  clients).
- Diff view between any two arbitrary versions (currently only sequential
  diffs are easy).
- Bulk import (paste a JSON / upload a zip with one prompt per client).
- A judge/report step over Playground conversations (deferred at Sprint 6
  planning, see `docs/SPRINT-6-archive.md`).

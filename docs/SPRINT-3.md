# Sprint 3 — Creator (chat-driven creation)

**Goal**: Chat with Claude Opus to build a *new* prompt from scratch, using an
existing prompt from the Library as **architectural reference** (structure,
lead flow, response format — not content) and a client brief as the content
source. Before constructing, Opus runs a clarifying questionnaire (only
blocking questions, grouped by category). The result is saved to the Library
as a new client at **v1.0**.

**Out of scope**: Adversarial Lab (Sprint 4), full visual polish (Sprint 5).
Editor flows are done (Sprint 2) and should be reused, not rebuilt.

> Source: `docs/ROADMAP.md` (Sprint 3) and `docs/SPEC.md` §3 (Creator). The
> scope below is the contract; the ticket-by-ticket breakdown is **to be
> planned** (see the "Tickets" section) before implementation starts.

---

## Includes

- **Creator chat UI** (`/creator`, `/creator/[id]`), wired to the
  `chat_sessions` / `chat_messages` tables with `type = 'creator'` (the schema
  and provider router already support it; the `creator` role default is
  configured in Settings).
- **Brief upload** to Supabase Storage (reuse the S2-T7 `uploads` flow + 7-day
  TTL; the multimodal attachment path from S2-T7b already feeds files to Opus).
- **Base-prompt picker** reading from the Library — selects the prompt whose
  architecture is transferred (structure only, not content).
- **Clarifying questionnaire UX** — Opus asks only blocking questions, grouped
  by category (product, profiling criteria, tone, objections,
  delivery/appointment); the user answers inline before construction.
- **Construction report** appended to the new version: "arquitectura
  trasladada / contenido extraído / pendiente".
- **Save as new client at v1.0** with a `NEW` badge for 15 days
  (`source: 'creator_chat'`, `bumpType` for the initial version).

## Definition of done

- From the Creator section, pick a base prompt, upload a brief, answer the
  questionnaire, and receive a complete new prompt.
- The new prompt is saved to the Library as a new client at v1.0, linked back
  to the session, and shows the `NEW` badge.
- The construction report (transferred / extracted / pending) is visible.
- Conversation persists and is reopenable; uploaded brief expires after 7 days.

## Tickets

**To be planned.** Break the scope above into one-ticket-at-a-time units
(Conventional Commits, branch `sprint-3/ticket-X-short-name`) following the
same shape as `docs/SPRINT-2-archive.md`. Reuse Sprint 2 infrastructure
wherever possible:

- Chat session/message data layer (`lib/db/chat-sessions.ts`) — already
  supports `type = 'creator'`.
- Upload + multimodal attachment path (`lib/db/uploads.ts`, the Anthropic
  adapter's attachment blocks).
- Streaming message endpoint pattern (`app/api/chat-sessions/[id]/messages`).
- Version creation (`createVersion` with `source: 'creator_chat'`).

Open questions to resolve during planning: the exact initial `bumpType`/version
number for a brand-new client at v1.0; how the questionnaire is represented in
the message stream (structured vs. free-form); and the `NEW`-badge 15-day
window storage (derive from `created_at` vs. an explicit column → may need a
new migration `00X_*.sql`).

When Sprint 3 is done, update the "Active sprint" line in `CLAUDE.md` to point
to `docs/SPRINT-4.md`, archive this file, and create `SPRINT-4.md` from the
roadmap/spec.

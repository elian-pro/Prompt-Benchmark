# Sprint 3 — Creator (chat-driven creation)

> **Status: ✅ complete (closed 2026-06-23).** Archived. The active sprint is
> now Sprint 4 — see `docs/SPRINT-4.md`. This file is kept for reference.

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

## Decisions (locked at planning, 2026-06-23)

These resolve the open questions. Build against them.

1. **No new migration.** The `chat_sessions.type` check already allows
   `'creator'`, `client_id` is nullable, the `creator` role exists in
   `role_defaults`, and the **NEW badge is already derived** from
   `clients.created_at <= 15 days` in `components/library/ClientCard.tsx`. So
   creating a client makes the badge appear automatically — no column, no flag.
2. **Session shape.** A creator session starts with `client_id = null`,
   `base_version_id` = the chosen architectural-reference version, and
   `current_draft_content = null`. The draft fills in as the conversation
   produces the prompt; the **client is created only at finalize** (S3-T7).
3. **Two-phase persona, conversational questionnaire.** The persona runs (a) a
   clarifying questionnaire — only blocking questions, grouped by category
   (producto, criterios de perfilamiento, tono, objeciones, entrega/cita) —
   then (b) construction. The questionnaire is **free-form chat**, not a
   structured form (mirrors Sprint 2 keeping input natural language). No schema
   change; the category taxonomy lives in the system prompt.
4. **Output contract** (same mechanism as the Editor, Decision #2 of Sprint 2):
   the assistant returns the **full new prompt in a fenced code block** plus a
   report outside it — `ARQUITECTURA TRASLADADA / CONTENIDO EXTRAÍDO /
   PENDIENTE`. The endpoint parses the code block into `current_draft_content`
   (reusing `extractPromptFromReply`); questionnaire turns have no code block,
   so the draft stays null until construction. The report renders as the chat
   message.
5. **Reference = structure only.** The base prompt is loaded from
   `base_version_id` and injected as **architectural reference** (lead flow,
   sections, response format) — the persona is instructed to take structure,
   never content, from it. Content comes from the brief.
6. **Finalize creates client + v1.0 in one step.** `createClient` already seeds
   an empty `v1.0`; extend it to accept an optional initial version
   (`content`, `source: 'creator_chat'`, `sourceSessionId`) so v1.0 carries the
   generated prompt. The new client's name/segment/location are collected at
   finalize (the session has no client yet). Then `finalizeSession`.
7. **Brief file types.** Reuse the existing upload allowlist (PDF, image, text,
   markdown) + the S2-T7b multimodal path. **`docx` is deferred** — it isn't in
   `ALLOWED_MIME` and Opus can't read it natively; parsing it needs a new dep
   (rule #3). For now, instruct the user to export the brief as PDF. Revisit if
   the team pushes back.

---

## Tickets

Bottom-up (data → API → UI), mirroring Sprint 2. Branch
`sprint-3/ticket-X-short-name`; one logical change per commit. Most tickets
generalize Sprint 2 code rather than adding new infrastructure.

### S3-T1 — Creator sessions in the data layer

Generalize the chat-sessions data layer to cover creator sessions.

**Tasks**:
- `lib/db/chat-sessions.ts`: generalize `createSession` to accept
  `type: 'creator'` with `clientId = null`, `baseVersionId` = the reference
  version, and **no draft seeding** (`current_draft_content = null`). Keep the
  editor path (seeds draft from base version) intact.
- Confirm `listSessions({ type: 'creator' })` and `getSession` work unchanged
  (both are already type-agnostic / type-parameterized).

**Done when**: a quick test can create a creator session with a null client and
a reference version, append messages, and read it back.

**Commits**: 1.

---

### S3-T2 — Creator session API routes

`app/api/chat-sessions/` + `lib/schemas/chat-sessions.ts`.

**Tasks**:
- Extend `POST /` (or branch the schema) to accept a creator session:
  `type: 'creator'`, `baseVersionId` required, `clientId` **absent**. The
  editor variant keeps requiring `clientId`.
- `GET /?type=creator` list and `GET /[id]` reuse the existing handlers.

**Done when**: create / list / read cycle works over HTTP for creator sessions.

**Commits**: 1-2 (schema, route).

---

### S3-T3 — "arquitecto-de-prompts" creator persona

`lib/prompts/creator-persona.ts`.

**Tasks**:
- Port the team's creation template per Decision #3, generalized multi-vertical.
- Export a builder parameterized by the **architectural-reference prompt** that
  enforces: structure-only transfer (Decision #5), the blocking-questionnaire
  phase grouped by category, then construction.
- Encode the output contract from Decision #4 (fenced prompt + `ARQUITECTURA
  TRASLADADA / CONTENIDO EXTRAÍDO / PENDIENTE` report). Reuse
  `extractPromptFromReply` for parsing.

**Done when**: the module returns a system prompt parameterized by the reference
prompt.

**Commits**: 1.

---

### S3-T4 — Creator streaming endpoint

`POST /api/chat-sessions/[id]/messages` (branch the existing endpoint by
`session.type`).

**Tasks**:
- For `type: 'creator'`: resolve the `creator` role from `role_defaults`, load
  the reference content from `base_version_id`, build the T3 system prompt, and
  stream with history + the brief attachments (reuse the S2-T7b multimodal
  path).
- On stream close, persist the assistant message with tokens. If the reply
  contains a fenced block, parse it into `current_draft_content`; questionnaire
  turns leave the draft untouched.

**Done when**: sending a message in a creator session streams a reply; tokens
persist; a construction turn updates the draft, a questionnaire turn doesn't.

**Commits**: 1-2.

---

### S3-T5 — Creator section: list + new-session flow

`app/creator/page.tsx` (the nav already links to `/creator`).

**Tasks**:
- List reopenable creator sessions + a "Nueva creación" action.
- New-session form: a **base-prompt picker** reading the Library (pick a client,
  use its production version, falling back to the latest) as the architectural
  reference. On submit, create the session and route to it. Brief upload happens
  in the chat (S3-T6), reusing `FileUpload`.

**Done when**: I can start a new creator session by choosing a reference prompt,
and reopen existing ones from the list.

**Commits**: 1-2.

---

### S3-T6 — Creator chat page

`app/creator/[id]/page.tsx`.

**Tasks**:
- Chat UI reusing `ChatMessage`, `FileUpload`, the streaming-read loop and the
  token counter from the Editor.
- Right panel shows the prompt being built (`current_draft_content`) and, once
  present, the construction report (transferred / extracted / pending).
- Empty state explains the flow: upload the brief, answer Opus's questionnaire,
  then receive the prompt.

**Done when**: the full conversation works end to end — questionnaire, answers,
construction, draft visible.

**Commits**: 1-2.

---

### S3-T7 — Finalize → new client at v1.0

`components/creator/FinalizeButton.tsx` (or extend the editor one) +
`POST /api/chat-sessions/[id]/finalize` (branch by type).

**Tasks**:
- Extend `createClient` to accept an optional initial version
  (`{ content, source: 'creator_chat', sourceSessionId }`) so v1.0 carries the
  generated prompt instead of the empty seed.
- Finalize for a creator session: collect the new client's name (segment,
  location optional) in the UI, create the client + v1.0, then `finalizeSession`
  linking `final_version_id`. The `NEW` badge appears automatically.

**Done when**: finalizing creates a new client at v1.0 with `source:
'creator_chat'`, linked to the session, visible in the Library with the NEW
badge.

**Commits**: 2 (data layer + route, UI).

---

When Sprint 3 is done, update the "Active sprint" line in `CLAUDE.md` to point
to `docs/SPRINT-4.md`, archive this file, and create `SPRINT-4.md` from the
roadmap/spec.

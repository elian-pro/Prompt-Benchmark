# Sprint 2 — Editor (chat-driven edits)

**Goal**: Chat with Claude Opus to make guided edits to a prompt. The user
selects a client from the Library, attaches context, describes the change in
natural language, and Opus produces an updated prompt applying only what was
asked. "Finalizar edición" commits the current state as a new minor version.

File uploads have a TTL of 7 days; the conversation text persists and is
reopenable.

**Out of scope**: AI-powered creation (Sprint 3), adversarial lab (Sprint 4),
full visual polish (Sprint 5).

> Source: `docs/ROADMAP.md` (Sprint 2). The scope below is the contract; the
> ticket-by-ticket breakdown (planned 2026-06-23) is in the "Tickets" section.

---

## Includes

- **Chat UI** for the Editor section (`/editor`, `/editor/[id]`), wired to the
  `chat_sessions` / `chat_messages` tables.
- **File upload to Supabase Storage** (`studio-uploads` bucket) with the
  `uploads` table tracking `expires_at = created_at + 7 days`. Application
  deletes the actual Storage object when an upload row is cleaned up (the
  `cleanup_expired_uploads()` cron only removes DB rows).
- **System prompt for the "ingeniero-de-prompts" persona**, ported from the
  team's existing manual edit template.
- **Streaming responses** via the provider router's `streamChat()`, using the
  model assigned to the `editor` role in Settings.
- **Token counter visible per session** (`tokensIn` / `tokensOut` from the
  router).
- **Conversation persistence**: sessions are reopenable; uploaded files expire
  after 7 days while the chat text remains.
- **"Finalizar edición"** commits the current draft as a new **minor** version
  in the Library (`source: 'editor_chat'`, linking `source_session_id`).

## Definition of done

- From a client in the Library, open an Editor session, attach a file,
  describe a change, and receive a streamed, surgically-edited prompt.
- The session persists and can be reopened; the uploaded file is tracked with
  a 7-day expiry.
- "Finalizar edición" creates a new minor version linked back to the session.
- The per-session token counter reflects real usage.

When Sprint 2 is done, update the "Active sprint" line in `CLAUDE.md` to point
to `docs/SPRINT-3.md`, archive this file, and create `SPRINT-3.md` from the
roadmap/spec.

---

## Decisions (locked at planning, 2026-06-23)

These resolve the open questions raised at planning. Build against them.

1. **Editor persona = the team's "make these edits" template**, not the
   creation one. Ported with two changes: (a) the `ROL` is generalized beyond
   real estate to multi-vertical lead-qualification agents (inmobiliario,
   restaurantero, wellness, …) so edits to non-real-estate clients aren't
   contaminated; (b) the persona does **not** bump version numbers — the Studio
   owns versioning via `createVersion`. The persona only edits and delivers.
2. **Output contract** (from the template, resolves how the draft is captured):
   the assistant returns the **full updated prompt inside a fenced code block**
   plus a `CAMBIOS REALIZADOS / SIN CAMBIOS` summary outside it. The endpoint
   parses the code block into `current_draft_content`; the summary renders as
   the assistant chat message. Chat input stays free-form natural language (per
   SPEC); the change-type taxonomy lives inside the system prompt as guidance.
3. **Token persistence**: yes. Migration `003` adds `tokens_in` / `tokens_out`
   to `chat_messages` so the per-session counter survives reopening.
4. **File types** (T7): text, PDF, image, and markdown. Passed to Opus
   natively. Voice notes are **out of scope** for this sprint.
5. **Storage**: the private `studio-uploads` bucket already exists in Supabase.

---

## Tickets

Bottom-up (data → API → UI), mirroring Sprint 1. Branch + commit per
`CLAUDE.md` rules; one logical change per commit.

### S2-T1 — Chat-sessions data layer + migration 003

DB access for editor sessions, plus the token columns the counter needs.

**Tasks**:
- Create `supabase/migrations/003_add_tokens_to_chat_messages.sql`:
  `alter table chat_messages add column if not exists tokens_in int`,
  same for `tokens_out`. Never edit `001`. Tell the user to run it.
- `lib/db/chat-sessions.ts`:
  - `listSessions({ type: 'editor', clientId? })` → session + client name,
    title, status, `updated_at`.
  - `getSession(id)` → session + ordered `chat_messages` + current draft.
  - `createSession({ clientId, baseVersionId })` → seeds
    `current_draft_content` from the base version, `type: 'editor'`,
    `status: 'active'`.
  - `appendMessage(sessionId, { role, content, attachments?, tokensIn?, tokensOut? })`.
  - `updateDraft(sessionId, content)`, `touch()` (refresh `updated_at`).

**Done when**: a quick test can create a session, append messages, and read
them back with token fields populated.

**Commits**: 2 (migration, data layer).

---

### S2-T2 — Chat-sessions API routes

`app/api/chat-sessions/`.

**Tasks**:
- `POST /` create session · `GET /?type=editor&clientId=` list.
- `GET /[id]` session + messages · `DELETE /[id]` → `status='abandoned'`.
- Zod validation in `lib/schemas/chat-sessions.ts`.

**Done when**: create / list / read cycle works over HTTP.

**Commits**: 2 (schema, routes).

---

### S2-T3 — "ingeniero-de-prompts" system prompt

`lib/prompts/editor-persona.ts`.

**Tasks**:
- Port the team's manual edit template per Decision #1 (generalized vertical,
  no model-side version bump).
- Export a builder that injects the current draft (prompt under edit) and
  enforces the surgical-edit rule (touch only what's asked; never reformat,
  summarize, or rewrite out-of-scope content — SPEC cross-cutting rule).
- Encode the output contract from Decision #2 (full prompt in a fenced code
  block + `CAMBIOS REALIZADOS / SIN CAMBIOS` summary).

**Done when**: the module returns a system prompt parameterized by the current
draft.

**Commits**: 1.

---

### S2-T4 — Editor streaming endpoint

`POST /api/chat-sessions/[id]/messages`, server-side.

**Tasks**:
- Persist the user message, resolve the `editor` role model from
  `role_defaults`, call `streamChat()` with the T3 system prompt + history.
- Stream the response to the client; on stream close, persist the assistant
  message (with `tokensIn` / `tokensOut`), parse the fenced code block into
  `current_draft_content`.

**Done when**: sending a message returns a streamed reply; the message, tokens,
and updated draft are persisted.

**Commits**: 1-2.

---

### S2-T5 — Editor session list page

`app/editor/page.tsx` (the nav already links to `/editor`).

**Tasks**:
- List existing (reopenable) sessions + a "Nueva edición" action with a client
  picker (reads `/api/clients`). Add an entry point from the client detail page
  in Library.

**Done when**: I can see my sessions and start a new one by choosing a client.

**Commits**: 1-2.

---

### S2-T6 — Editor chat page (UI + streaming)

`app/editor/[id]/page.tsx` + `components/editor/ChatMessage.tsx`.

**Tasks**:
- Render user/assistant bubbles, input box, incremental stream rendering,
  loading state, persistence on reopen.
- Current-draft panel (the resulting prompt) with copy-to-clipboard.

**Done when**: a smooth, streamed conversation that survives a page reload.

**Commits**: 2-3.

---

### S2-T7 — File upload to Storage (7-day TTL)

`app/api/uploads/` + `lib/db/uploads.ts` + `components/editor/FileUpload.tsx`.

**Tasks**:
- Accept text, PDF, image, markdown (Decision #4). Upload to the existing
  `studio-uploads` bucket, insert an `uploads` row (`expires_at` already
  defaults to +7 days), link `session_id`, store a reference in
  `chat_messages.attachments`.
- On upload-row delete, the API route also calls
  `storage.from('studio-uploads').remove([path])` — the cron only cleans DB
  rows (ARCHITECTURE mandate).

**Done when**: I attach a file, it lands in Storage + the table with an expiry;
on cleanup it disappears from Storage too.

**Commits**: 2-3.

---

### S2-T8 — Per-session token counter

**Tasks**:
- Sum `tokens_in` / `tokens_out` across the session's messages; show it in the
  chat UI.

**Done when**: the counter reflects real usage and persists across reopen.

**Commits**: 1.

---

### S2-T9 — "Finalizar edición" → new minor version

`components/editor/FinalizeButton.tsx` + `POST /api/chat-sessions/[id]/finalize`.

**Tasks**:
- Call `createVersion(clientId, draft, { bumpType: 'minor', source:
  'editor_chat', sourceSessionId })` (already supported in `lib/db/versions.ts`).
- Mark the session `status='finalized'`, set `final_version_id` and
  `finalized_at`.

**Done when**: finalizing creates a minor version linked to the session and
visible in the Library.

**Commits**: 1-2.

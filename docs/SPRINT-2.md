# Sprint 2 — Editor (chat-driven edits)

**Goal**: Chat with Claude Opus to make guided edits to a prompt. The user
selects a client from the Library, attaches context, describes the change in
natural language, and Opus produces an updated prompt applying only what was
asked. "Finalizar edición" commits the current state as a new minor version.

File uploads have a TTL of 7 days; the conversation text persists and is
reopenable.

**Out of scope**: AI-powered creation (Sprint 3), adversarial lab (Sprint 4),
full visual polish (Sprint 5).

> Source: `docs/ROADMAP.md` (Sprint 2). Ticket-by-ticket breakdown to be
> filled in at sprint planning; the scope below is the contract.

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

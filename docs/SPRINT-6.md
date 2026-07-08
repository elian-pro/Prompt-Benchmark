# Sprint 6 — Lab: Playground + notes-to-Editor handoff

**Goal**: turn the Adversarial-only "Lab" into a hub with two ways to test a
client's prompt before publishing: the existing **IA vs IA** run, and a new
**Playground** where the user themselves converses with the prompt (as a
simulated lead), tags messages, writes feedback notes, and sends those notes
straight into an Editor session to make the fix.

This is cross-cutting inside one section: Lab gains a hub landing page and a
brand-new conversational mode; Editor gains one small entry point (accepting
a pre-filled first message from Playground's handoff).

**Out of scope**: a judge/report over Playground conversations (the mode is
the user's own evaluation, not an automated one). Can be added later without
breaking this sprint's shape.

## Decisions (locked at planning)

1. **Naming.** The section is called **Lab** (nav item, `/lab`). Its two
   modes are **IA vs IA** (the existing Adversarial run, untouched, now
   reached via a card instead of being the section itself) and
   **Playground** (the new manual mode).

2. **Playground reuses the Adversarial engine's message parsing.** The
   client's prompt replies with `{"estado": ..., "mensajes": [...]}`; each
   array element renders as its own chat bubble (WhatsApp-style), `estado`
   as a discreet metadata line below, using the same `extractMessage` /
   `extractState` helpers `lib/adversarial-message.ts` already has. Special
   states (`humano`, `mensaje-aut`, `lead-grosero` with an empty `mensajes`
   array) render explicitly, e.g. "El bot pasó a estado «humano» y dejó de
   responder" — this is exactly what a live test needs to verify.

3. **Model**: Playground uses the `test_bot` role from Settings, same as
   the bot side of an Adversarial run, so a Playground conversation reflects
   production behavior.

4. **Snapshot, not live version.** Starting a Playground session freezes the
   chosen client + version's content, same as an Adversarial run — a later
   version bump on that client doesn't change an in-progress session's rules.

5. **Notes panel**: multi-select messages (mine and/or the bot's) by
   clicking them, then write one note referencing that selection. Notes can
   also be general (no message references). Tagged messages show a numbered
   pin; clicking a pin jumps to its note and vice versa.

6. **Handoff to Editor is review-first, not auto-send.** "Enviar al Editor"
   creates an Editor session on the exact version that was tested (not
   latest, not production — the one actually probed) and lands the user in
   that chat with the first message pre-filled in the composer, built from
   the notes (quoted references + feedback text), editable before sending.

7. **Style rule (project-wide, not just this sprint): no em dashes.** See
   `CLAUDE.md` rule 9.

## Tickets

### T1 — Lab hub ✅

Rename the Adversarial nav entry to "Lab" (`/lab`). New `/lab` page: two
cards, "IA vs IA" (links to the existing `/adversarial`, untouched) and
"Playground" (disabled with a "Próximamente" badge until T2 ships). Add a
back-link from `/adversarial` up to `/lab`. Rename the "Adversarial Lab"
page title and back-link label to "IA vs IA" for consistency with the new
naming (`app/adversarial/page.tsx`, `app/adversarial/[id]/page.tsx`,
Settings' judge system-prompt card title).

### T2 — Playground conversation ✅

New route (`/lab/playground`), enabling the hub card. Pick client + version
(defaults to production), start a session, converse in WhatsApp-style
bubbles with the JSON parsing/state handling from decision 2, "Escribiendo…"
indicator while the bot replies. Session history (list past Playground
sessions: client, version, message count, date), reopenable.

Migration `008` (new, additive): `demo_sessions` (client, version tested,
`prompt_snapshot`, `version_number_snapshot`, status, link to the Editor
session created by the handoff), `demo_messages` (role, content, order). The
`estado` metadata isn't its own column: it's derived at render time from
`content` via the same `parseTurn` helper the Adversarial detail page
already uses, mirroring how `run_messages` does it too.

### T3 — Notes panel ✅

Right-side panel in the Playground chat: click one or more messages to tag
them, write a note (tagged or general), numbered pins linking message ↔
note in both directions, edit/delete a note. Persisted immediately via a
new migration `009` (additive, `008` was already shipped by T2):
`demo_notes` (text, `message_ids` as a jsonb array, timestamps). A note's
number is just its position in creation order, no separate column needed.

### T4 — Handoff to Editor

"Enviar al Editor (N notas)" button: creates an Editor session on the
snapshot's version, composes the first message from the notes (quoted
message references + feedback, one block per note), lands the user in that
Editor session with the message pre-filled and editable in the composer
(not auto-sent — decision 6). Marks the Playground session "sent to Editor"
with a link to the created session (trace in both directions).

Needs a small Editor entry point: today a session only auto-sends a first
message when it's created from the Editor's own idle composer
(`SessionWorkspace`'s `autoSend`). Playground's handoff needs the same
mechanism reachable from a different page — likely via the session-create
API accepting an initial draft message, or a query param the Editor
session page reads once on mount. Resolve exactly at T4 planning.

## Definition of done

- `/lab` shows both modes; IA vs IA behaves exactly as before under its new
  name and location.
- Playground: pick a client/version, converse, see clean WhatsApp-style
  bubbles (not raw JSON), see special states explicitly.
- Tag one or more messages, write a note, see it listed with its message
  references; edit and delete notes.
- "Enviar al Editor" lands in an Editor session on the tested version with
  the notes pre-filled as an editable first message.
- No em dashes anywhere in new UI text, code, or docs written this sprint.

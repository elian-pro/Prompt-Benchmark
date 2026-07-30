# CLAUDE.md

You are working on ZEBRA · Prompt Studio. This file is loaded at the start
of every Claude Code session. Keep it short — it indexes the rest, doesn't
replace it.

## What this project is

An internal tool for the Zebra agency's paid media team. Four sections:

- **Lab** — put a client's prompt to the test. Two modes: **IA vs IA**
  (red-teaming: two AIs converse, a judge produces a structured failure
  report) and **Playground** (chat with the prompt yourself, as a simulated
  lead, for live demos; tag messages, write feedback notes, send them to the
  Editor).
- **Editor** — chat with Claude Opus to make guided edits to a prompt.
- **Creator** — chat with Claude Opus to build a new prompt from a brief.
- **Library** — clients, versions, import existing prompts.

The product output is always: a clean prompt the user copies to clipboard
and pastes into the corresponding n8n node.

## Where to find what

| Looking for… | File |
|---|---|
| Product behavior, user flows, the 4 sections | `docs/SPEC.md` |
| Tech stack, file structure, provider architecture, security model | `docs/ARCHITECTURE.md` |
| Colors, typography, component patterns | `docs/DESIGN-SYSTEM.md` |
| All sprints overview | `docs/ROADMAP.md` |
| Sprint plans (all complete, archived) | `docs/SPRINT-1-archive.md` … `docs/SPRINT-9-archive.md` (no Sprint 7 file, see `docs/N8N-SYNC-PLAN.md`) |
| Database schema source of truth | `supabase/migrations/` |

## Rules of engagement

1. **One ticket at a time.** Active sprint file tells you the order. Don't
   combine tickets, don't preempt future ones. If the user asks for "ticket
   S1-T3", do only that ticket.

2. **Never edit `001_initial.sql`.** It's already deployed. If a ticket
   needs a schema change, create a new migration file (`002_*.sql`,
   `003_*.sql`, etc.) and tell the user to run it.

3. **Ask before adding dependencies.** Check `package.json` first. Prefer
   what's already installed. If a new dep is needed, name it, explain why,
   wait for approval.

4. **Commit small, commit often.** One logical change per commit.
   Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`,
   `test:`.

5. **Never create or switch branches on your own.** The repo keeps exactly
   two active branches: `main` and the current working branch. Everything
   goes on whichever branch is already checked out, including small fixes
   unrelated to the branch name. Only the user opens, closes or merges a
   branch, and only when they say so.

6. **Server-side only for secrets.** LLM API calls, Supabase service_role
   client, and key decryption all live in Next.js API routes
   (`/app/api/...`) or `/lib`. Never in client components.

7. **Never commit secrets.** `.env` is gitignored. New env vars get a
   placeholder entry in `.env.example`.

8. **UI in Spanish.** All visible labels, buttons, errors, modals — in
   Spanish (the team is Mexican). Code, comments, commit messages, and
   file names in English.

9. **Stop and ask if uncertain.** Better to pause than to invent. Common
   reasons to stop: ambiguous ticket, missing context not in the docs,
   library decision with multiple valid options, anything that touches the
   SQL or security model.

10. **No em dashes (—).** Never use one, anywhere: UI text, docs, commit
   messages, code comments. Use a period, comma, colon, or restructure the
   sentence instead.

## Active sprint

Sprint 17, searchable history and conversations as cases: plan in
`docs/SPRINT-17-history-cases-plan.md`. Nothing implemented yet; the data
groundwork (the `turnos` column, its trigger, the n8n flows that write it) is
done.

Sprint 16 (client provisioning) is verified end to end: Chapur was provisioned
from the template, retargeted to `chats_Chapur` and bound to
`dudas/conversacion`.

Sprints 1 through 15 are complete (there is no Sprint 12). Sprints 1 to 6, 8
and 9 have archived plans in `docs/SPRINT-*-archive.md`; Sprint 7 is
`docs/N8N-SYNC-PLAN.md`; sprints 10 to 15 shipped without a plan file and are
only documented in `docs/ROADMAP.md`, `docs/SPEC.md` and
`docs/ARCHITECTURE.md`.

# CLAUDE.md

You are working on ZEBRA · Prompt Studio. This file is loaded at the start
of every Claude Code session. Keep it short — it indexes the rest, doesn't
replace it.

## What this project is

An internal tool for the Zebra agency's paid media team. Four sections:

- **Adversarial Lab** — red-teaming: two AIs converse, a judge produces a
  structured failure report.
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
| **Active sprint — ticket-by-ticket plan** | `docs/SPRINT-5.md` |
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
   `test:`. Work on a branch named `sprint-N/ticket-X-short-name`.

5. **Server-side only for secrets.** LLM API calls, Supabase service_role
   client, and key decryption all live in Next.js API routes
   (`/app/api/...`) or `/lib`. Never in client components.

6. **Never commit secrets.** `.env` is gitignored. New env vars get a
   placeholder entry in `.env.example`.

7. **UI in Spanish.** All visible labels, buttons, errors, modals — in
   Spanish (the team is Mexican). Code, comments, commit messages, and
   file names in English.

8. **Stop and ask if uncertain.** Better to pause than to invent. Common
   reasons to stop: ambiguous ticket, missing context not in the docs,
   library decision with multiple valid options, anything that touches the
   SQL or security model.

## Active sprint

**Sprint 5 — Visual polish.** See `docs/SPRINT-5.md`. Sprints 1–4 are complete;
their plans are archived at `docs/SPRINT-1-archive.md` through
`docs/SPRINT-4-archive.md`. This is the final planned sprint — when it
finishes, there is no Sprint 6: mark the roadmap complete here, archive
SPRINT-5.md, and revisit `docs/ROADMAP.md` "Future" for next steps.

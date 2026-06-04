# ZEBRA · Prompt Studio

Internal tool for the Zebra paid media team. Design, edit, test, and version
conversational lead-qualification prompts. Replaces the manual flow of
copy-pasting prompts between n8n and Claude chats.

## Status

In active development. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for sprint status.

## Getting started

1. Clone the repo.
2. Copy `.env.example` to `.env` and fill in the values:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase
     project's API settings.
   - `KEY_ENCRYPTION_SECRET` — generate a long random string (e.g.
     `openssl rand -hex 32`). Rotating this invalidates all stored
     provider API keys.
3. Apply the SQL migration in `supabase/migrations/001_initial.sql`
   in your Supabase SQL Editor (if not already applied).
4. Install dependencies and start dev server.

## For Claude Code sessions

Read [`CLAUDE.md`](CLAUDE.md) before anything else. It indexes the docs and
lists the rules of engagement for working on this codebase.

## Architecture summary

- Next.js 14+ App Router, TypeScript.
- Supabase (Postgres + Storage).
- Auth via EasyPanel HTTP Basic Auth — no in-app login.
- Multi-provider LLM access via a unified adapter pattern.
- See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

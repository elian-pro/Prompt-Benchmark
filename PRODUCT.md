# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary and only real user: the Zebra agency's paid media team.** Mexican,
Spanish-speaking, technically fluent, working on client-facing conversational
lead-qualification bots. They use every section of the tool: Lab, Editor,
Creator, Library, Settings.

**Secondary, non-user audience: the client** (mostly real estate developers).
The client never operates the product. They are an occasional guest on exactly
one screen, the public demo link `/prueba/<token>`, where they test a bot and
report what went wrong. Confirmed by the user: the client is a guest, not a
first-class user, and the product keeps being designed for the internal team.

## Product Purpose

ZEBRA · Prompt Studio replaces the chaotic editing process around n8n. The
team designs, edits, stress-tests and versions the prompts that power client
lead-qualification chatbots.

Before the Studio, the workflow was: write the prompt in a Claude chat, paste
it into an n8n node (the only source of truth), copy it back out for every
change, repeat forever. Version history lived nowhere, prompts were rarely
stress-tested, and every new client was rebuilt from memory.

The output is always the same artifact: a clean prompt. Copy to clipboard and
paste into the n8n node is always available; since Sprint 7 a client can be
bound to its n8n node so promoting a version deploys directly. The Studio does
not replace n8n.

Success: no prompt reaches production without a version history and a
stress test behind it.

## Positioning

A prompt IDE built around one specific production runtime. Its differentiator
is not "prompt management" in the abstract, it is that the bot under test runs
with the exact same model, temperature and system prompt as production, that
versions deploy into the client's real n8n node, and that the failure report
comes from an adversarial run, not from a human reading the prompt and
guessing. A generic prompt manager cannot truthfully claim the tested artifact
and the shipped artifact are the same one.

## Operating Context

- **Production runtime is n8n.** Prompts live in n8n nodes and answer over
  WhatsApp. The bot's replies are split into multiple messages the way n8n
  delivers them, and the Studio mirrors that.
- **Clients are mostly real estate developers**; the bots qualify leads.
- **Four sections.** Lab (four modes: IA vs IA red-teaming with a judge,
  Playground for manual testing, Demo for the client behind a shared link,
  Replay over a real past conversation), Editor (guided edits with Claude
  Opus), Creator (new prompt from a brief), Library (clients, versions,
  imports, n8n binding and sync).
- **Rituals that are part of the job**: promoting a version, handing a demo
  link to a client, approving or rejecting what the client reported before
  anything reaches the Editor, tagging messages and writing notes during a
  live test.

## Capabilities and Constraints

- **Stack**: Next.js App Router + TypeScript, Supabase (Postgres + Storage),
  deployed on EasyPanel. Dependencies are deliberately few
  (`@anthropic-ai/sdk`, `@google/genai`, `@supabase/supabase-js`,
  `@tabler/icons-react`, `clsx`, `zod`). New dependencies require approval.
- **Auth**: in-app "Entrar con Google" restricted to the company domain, with
  an app-signed session cookie. No Supabase Auth.
- **One public route**: `/prueba/<token>` and `/api/prueba/<token>/*` answer
  without a session and still use the `service_role` client. Spend is bounded
  per link (`max_sessions`, `max_messages`).
- **Multi-provider LLM access** through a unified adapter (Anthropic, Google,
  OpenAI-compatible, OpenRouter). Secrets, provider calls and key decryption
  are server-side only.
- **UI language is Spanish**; code, comments, docs, commit messages and file
  names are English.
- **No em dashes anywhere**, including UI text.
- Database schema source of truth is `supabase/migrations/`.
- **Undecided / not established**: no confirmed statement about which devices
  or screen sizes the work must target, beyond what the current code already
  supports. Do not assume a mobile-first or desktop-only mandate without
  asking.

## Brand Commitments

Confirmed by the user: **two authorities, split by surface.**

- **Internal tool** (Lab, Editor, Creator, Library, Settings, login): the
  incumbent in-repo design system at `docs/DESIGN-SYSTEM.md` is the standing
  authority and is preserved. It is shared with the sibling product
  ZEBRA · COTI AUTO.
- **Public client-facing surface** (`/prueba/<token>`): must read as corporate
  Zebra to the client, per the Zebra corporate design system (Virtual Stripes
  26), not merely as the internal tool with the login removed.

Product name is **ZEBRA · Prompt Studio**.

## Evidence on Hand

- Extensive first-party documentation, all current: `docs/SPEC.md` (product
  behavior and the four sections), `docs/ARCHITECTURE.md` (stack, providers,
  security model, schema notes), `docs/DESIGN-SYSTEM.md`, `docs/ROADMAP.md`,
  and per-sprint plans in `docs/SPRINT-*.md`. `CLAUDE.md` indexes them and
  carries the rules of engagement.
- Real production usage: at least one client (Chapur) provisioned end to end
  from the template and bound to its n8n workflow.
- Real prompts imported from production n8n nodes.
- **Absent, do not fabricate**: testimonials, customer counts, benchmarks,
  pricing, licensing, uptime or performance claims. This is an internal tool
  with no commercial surface.

## Product Principles

1. **The tested artifact is the shipped artifact.** Anything that lets the
   test drift from production (different model, temperature or prompt)
   invalidates the test and is a defect, not a convenience.
2. **n8n stays the runtime.** The Studio wraps the editing process around it
   and never tries to replace it. Copy-to-clipboard always remains a valid
   exit.
3. **Nothing reaches the Editor unapproved.** Client-reported findings are
   proposals until a team member approves them.
4. **The team is the user; the client is a guest.** Internal surfaces optimize
   for the operator. The one public surface optimizes for a stranger with no
   context and no training.
5. **Small, reversible, versioned.** Every prompt change is a version with
   history; every schema change is a new migration; the existing one is never
   edited.

## Accessibility & Inclusion

No formal accessibility standard is committed for this product (confirmed by
the user). Baseline craft still applies; there is no WCAG conformance target
to design against.

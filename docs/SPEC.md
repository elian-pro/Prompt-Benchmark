# Product Spec

## The problem

The Zebra paid media team designs conversational lead-qualification chatbots
for clients (mostly real estate developers). Today the workflow is:

1. Write the prompt by hand in a Claude chat.
2. Paste it into an n8n workflow node — this becomes the source of truth.
3. When the client requests changes, copy the prompt back out of n8n, paste
   it into a Claude chat with a manual "make these edits" instruction
   template, get a new version, paste back into n8n.
4. Repeat indefinitely.

**Pain points:**
- Version history lives nowhere.
- n8n nodes are the only source of truth — fragile.
- Prompts only get stress-tested manually if at all.
- No quick way to compare what changed between iterations.
- New clients take time because the team rebuilds from memory each time.

## The goal

A single tool where the team:

- Stores the prompt for every client (importing the existing production ones).
- Edits prompts with full version history.
- Stress-tests prompts adversarially before sending to production.
- Creates new prompts from briefs using a chat-driven flow.

Output is always the same: a clean prompt the user copies to clipboard and
pastes into the corresponding n8n node. The Studio doesn't replace n8n; it
replaces the chaotic editing process around n8n.

## The four sections

### 1. Lab: IA vs IA

> As of Sprint 6, Lab is a hub (`/lab`) with two modes: **IA vs IA**
> (described below, unchanged) and **Playground** (the user converses with
> the prompt themselves; see `docs/SPRINT-6-archive.md`).

Two AIs converse and a judge produces a structured report.

- **Bot under test** runs the prompt selected from the Library. MUST use
  the exact same model, temperature, and system prompt as production;
  otherwise the test is invalid.
- **Adversarial lead** runs one of five personas at intensity 1-3:
  `caotico` (typos, off-topic, multimensaje), `evasivo` (won't give data,
  responds with questions), `manipulador` (tries to extract discounts /
  jailbreak), `interrogador` (forces hallucinations with hyper-detail),
  `comprador` (urgent, frustrated, multi-message bursts).
- **Judge** analyses the full conversation and produces JSON: findings
  categorized by failure mode + severity (`crítico`/`medio`/`bajo`),
  hypothesis of what's wrong, suggested fix, edge cases, scope disclaimer.

The 8 failure modes the judge looks for: salida de rol, pérdida de
objetivo, alucinación, fallo de alcance, manipulación/jailbreak, loop/
estancamiento, ruptura de tono/marca, fallo con input degradado.

### 2. Editor (chat-driven edits)

A chat interface with Claude Opus.

- User selects a client from the Library.
- Attaches: real conversations from the client's chatbot in production,
  PDFs, screenshots, voice notes, etc.
- Describes the change in natural language.
- Opus produces an updated prompt, surgically applying only what was asked.
- User reviews. When ready, clicks "Finalizar edición" → committed as a
  new minor version in the Library.

Editor conversations persist (can be reopened). Uploaded files expire
after 7 days; the conversation text remains.

Also supports **direct manual editing** of the prompt textarea — no AI
needed. Use case: client says "change 16% to 15%", you Ctrl+F and replace.
Autosaves as a draft; "Finalizar edición" commits as new version.

### 3. Creator (chat-driven creation)

A chat interface with Claude Opus.

- User picks an existing prompt from the Library to use as **architectural
  reference** (structure, lead flow, response format) — not content.
- Uploads the client's brief (PDF, docx, images).
- Opus first asks a clarifying questionnaire — only blocking questions,
  grouped by category (product, profiling criteria, tone, objections,
  delivery/appointment).
- User answers.
- Opus produces the new prompt. Saved to Library as a new client at v1.0,
  with a `NEW` badge for 15 days.

### 4. Library

The data hub. Grid of cards, one per client.

Each card shows:
- Client name + meta (segment, location).
- Current production version (big).
- Last update.
- Version count (e.g. "3 / 5 versiones").
- Badges: `NEW` (15 days after creation), `NEW VERSION` (3-5 days after a
  major bump), `LEGACY` (clients imported from production).
- Actions: edit (link to detail), copy production prompt to clipboard,
  delete (two-step confirmation).

Top of page:
- Filter chips: TODOS / PRODUCCIÓN / EN EDICIÓN / LEGACY / ARCHIVADOS.
- Search input.
- Buttons: "+ IMPORTAR EXISTENTE" and "+ NUEVO CLIENTE".

Click a card → client detail with version list, manual textarea editor,
"Finalizar edición" button, "Promover a producción" button, copy-to-
clipboard button.

## Cross-cutting rules

- **The prompt under test is untouchable.** What the user types/pastes is
  what gets used. The tool never reformats, summarizes, or rewrites the
  prompt content. The judge can SUGGEST changes in its report; only the
  Editor applies them, and only via a new version.

- **Max 5 versions per client.** Adding the 6th deletes the oldest
  non-production version automatically. The production-flagged version is
  always protected.

- **NEW badge**: 15 days after client creation. Imported (LEGACY) clients
  don't get this badge.

- **NEW VERSION badge**: 3-5 days after promoting a version to major
  (v1.x → v2.0).

- **Multi-provider LLM.** Each role (test_bot, adversarial_lead, judge,
  editor, creator) has its own model assignment in Settings. Adding a new
  provider that uses an existing adapter type doesn't require code
  changes, just configuration.

## Honesty about scope

The Adversarial Lab catches systematic, reproducible failures (funnel
logic, objection handling, scope, tone, hallucination, jailbreaks). It
does **NOT** replace testing with real users — an LLM is not a
representative sample of the client's audience. The judge's report always
closes with a reminder of this limitation. Estimated coverage: ~60-70% of
obvious adjustments before launch, not 100%.

## Team and access

- 2 users (the paid media department).
- No per-user separation: shared workspace, all see all.
- App lives on a private VPS behind EasyPanel HTTP Basic Auth (2
  user:password pairs).
- No public signup, no in-app login screen.

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

Output is always the same: a clean prompt. Copying it to clipboard and
pasting into the corresponding n8n node is still always available; since
Sprint 7, a client can also be bound to its n8n node so that promoting a
version deploys the prompt there directly (see "n8n sync" under Library
below). The Studio doesn't replace n8n; it replaces the chaotic editing
process around n8n.

## The four sections

### 1. Lab: IA vs IA

> As of Sprint 6, Lab is a hub (`/lab`) with two modes: **IA vs IA**
> (described below, unchanged) and **Playground** (the user converses with
> the prompt themselves; base behavior in `docs/SPRINT-6-archive.md`, the
> Sprint 8 redesign below).

#### Playground (Sprint 8 redesign)

The manual test chat where the user plays the lead against a client's prompt.
Sprint 8 changes:

- **Switch version mid-session.** The session header has a version picker, so
  one session can test several versions without creating a new session each
  time. Switching starts a fresh conversation. Once the session has notes the
  picker locks (with an "i" hint): notes are tied to the version they were
  written against, so changing it is blocked until they're deleted.
- **Reset the conversation.** A "Reiniciar" button starts the chat from zero
  while keeping all notes. Nothing is deleted: the conversation is versioned
  into rounds and only the current round is shown.
- **Live note tagging.** Selecting messages shows their tagged-bubble previews
  in the note composer immediately (each removable), with check / x buttons to
  save or cancel, instead of only seeing them after saving. The notes panel is
  its own enclosed section.
- **WhatsApp-style bubbles.** A bot reply is split into one bubble per line
  break / `mensajes` array item (the way n8n delivers it to WhatsApp): the
  first bubble is labeled "Bot del cliente", the estado JSON hangs off the
  last. Tagging is per turn, not per individual bubble.
- **Opening message (Sprint 14).** Starting a conversation can optionally
  include a canned bot message (e.g. a WhatsApp-style greeting), so the chat
  opens with the bot having already "spoken" instead of always waiting on
  the human to send the first message. Optional: sessions without one behave
  exactly as before. It's replayed as turn 1 whenever the conversation
  starts a fresh round, not just at creation: "Reiniciar" and switching
  version both already start a clean round, so the greeting reappears there
  too for consistency.

Two AIs converse and a judge produces a structured report.

- **Bot under test** runs the prompt selected from the Library. MUST use
  the exact same model, temperature, and system prompt as production;
  otherwise the test is invalid.
- **Adversarial lead** runs one of five personas at intensity 1-3:
  `caotico` (typos, off-topic, multimensaje), `evasivo` (won't give data,
  responds with questions), `manipulador` (tries to extract discounts /
  jailbreak), `interrogador` (forces hallucinations with hyper-detail),
  `comprador` (urgent, frustrated, multi-message bursts). The lead never
  sees the bot's prompt (that would let it target known weak spots instead
  of behaving like a real prospect who doesn't know the agent's rules).
  Since Sprint 11, when starting a run the team can optionally write a
  short "situación del lead" brief (e.g. "Eres un empresario, tienes un
  presupuesto de 20mdp y quieres una casa"). Without it the lead has no
  concrete facts to draw on when the bot asks for specifics and either
  stalls or improvises something incoherent that gets it misclassified as
  unqualified, cutting the test short. The brief is still just the lead's
  own situation, not the bot's prompt.
- **Judge** analyses the full conversation and produces JSON: findings
  categorized by failure mode + severity (`crítico`/`medio`/`bajo`),
  hypothesis of what's wrong, suggested fix, edge cases, scope disclaimer.
  Since Sprint 11 the judge also receives the bot's prompt as labeled
  reference context (not just the transcript), so it can actually check
  claims against the agent's real instructions instead of guessing at
  what counts as a hallucination or scope failure.

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

In the AI turn the updated prompt appears as a collapsed "Prompt actualizado"
card (with an "escribiendo..." state while it streams), followed by a short
CAMBIOS REALIZADOS summary. The full prompt is never dumped as chat text, even
when the prompt itself contains code blocks. The prompt already shows the
version it will become (the next minor, e.g. v1.8) so the change is visible
while editing. The change summary is capped at 3 bullets / 250 characters.

While editing, a "NEW" badge lights on "Ver borrador" when a fresh draft is
ready. From there (or the topbar) the user can, after finalizing, "Promover a
producción", which also triggers the n8n sync if the client is bound. A
jump-to-bottom button appears when the chat is scrolled up.

Editor conversations persist (can be reopened). Uploaded files expire
after 7 days; the conversation text remains.

Also supports **direct manual editing** of the prompt textarea — no AI
needed. Use case: client says "change 16% to 15%", you Ctrl+F and replace.
Autosaves as a draft; "Finalizar edición" commits as new version.

**Smart Paste (Sprint 15).** Pasting a long block of text into the Editor or
Creator chat composer (not the manual draft editor) converts it into a
removable `.txt` attachment instead of dumping raw text into the message
field, so a huge pasted conversation or brief doesn't make the composer
unreadable. The chip can be expanded to preview the pasted text (read-only)
or "convertido de vuelta a texto plano" to undo it before sending; either
way it uses the same upload pipeline as a manually attached file. The
activation threshold (characters, `>=` triggers conversion) and an on/off
switch are configured once for the whole team in Settings → Composición de
mensajes (this app has no per-user accounts, so it's a shared setting, not
per-user).

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
- Since Sprint 13, a yellow "n8n Zebra" / "n8n propio" tag on every card,
  answering a mandatory question asked when the client is created (either
  from "+ Nuevo cliente" or "+ Importar existente"): does its agent live in
  Zebra's own n8n or the client's own. This tag is independent of whether
  the detailed n8n binding below (connection + workflow + node, or a manual
  label) has actually been configured yet; it's editable any time by
  clicking it on the client detail page.
- A small icon (since Sprint 7) when the client has a manual n8n binding
  that hasn't confirmed the current production version yet, so a pending
  hand-deploy is visible without opening the client.
- Actions: edit (link to detail), copy production prompt to clipboard,
  delete (two-step confirmation).

Top of page:
- Filter chips: TODOS / PRODUCCIÓN / EN EDICIÓN / LEGACY / ARCHIVADOS.
- Search input.
- Buttons: "+ IMPORTAR EXISTENTE" and "+ NUEVO CLIENTE".

Click a card → client detail with version list, manual textarea editor,
"Finalizar edición" button, "Promover a producción" button, copy-to-
clipboard button.

#### n8n sync (Sprint 7)

A client detail can be bound to one or more n8n deploy targets, chosen
when the client is created, imported, or any time later from its detail
page. Two kinds of target:

- **A connected n8n node.** The user picks a connection (configured once
  in Settings, see below), a workflow, and the specific AI Agent node
  (workflows can have more than one, so the picker shows a prompt preview
  per node to tell them apart). "Promover a producción" then offers to
  push the prompt there, showing a before/after diff to confirm first.
  Warns if the deploy would drop an n8n `{{ }}` data interpolation the
  live node currently has. The client detail shows a live status per
  target: Sincronizado, Desincronizado (someone edited the node by hand
  in n8n), Nodo no encontrado, or Sin verificar. A "Sincronizaciones"
  history panel lists every push with a "Revertir" action.
- **A client's own n8n (no access).** Just a label, e.g. "n8n de Kuyabeh,
  flujo WhatsApp". No automatic push. After promoting, the user copies
  the prompt and pastes it by hand, then presses "Marcar como
  actualizado" to clear the pending reminder.

**Settings → Conexiones n8n**: add/edit/remove n8n instances (name, base
URL, API key, "Probar conexión"). Multiple instances are supported (the
team's own n8n, plus any client instance that shares credentials), even
though today almost everything lives in the team's own instance.

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
- App lives on a private VPS. Access is gated by an in-app "Entrar con
  Google" login (Sprint 10): only Google accounts in the company domain
  `@zebradigital.marketing` can enter. The app talks to Google directly and
  mints its own signed session cookie (no external auth service); the domain
  is enforced server-side in `middleware.ts`, so a client-side bypass is not
  possible. This replaces the previous EasyPanel HTTP Basic Auth.
- No public signup. The login screen only offers Google; there is no
  password form to manage.

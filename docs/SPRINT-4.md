# Sprint 4 — Adversarial Lab

**Goal**: Reintegrate the original stress-test functionality on top of the
versioning model. A **bot under test** runs a prompt selected from the Library
(using the *exact* production model, temperature and system prompt — otherwise
the test is invalid). An **adversarial lead** runs one of five personas at an
intensity of 1–3 and the two AIs converse turn by turn. When the conversation
ends, a **judge** analyzes the full transcript and produces a structured JSON
report categorized by failure mode and severity.

**Out of scope**: full visual polish (Sprint 5). The Editor (Sprint 2) and
Creator (Sprint 3) are done and should be reused where the chat/streaming
infrastructure fits.

> Source: `docs/ROADMAP.md` (Sprint 4) and `docs/SPEC.md` §1 (Adversarial Lab).
> The scope below is the contract; the ticket-by-ticket breakdown is **to be
> planned** (see "Tickets") before implementation starts.

---

## Includes

- **Lab UI** (`/lab`, `/lab/[id]`), wired to the existing `runs` table
  (`001_initial.sql` already has it: snapshots, preset, intensity, configs,
  status). The nav links to `/lab`.
- **Run configuration**: pick a client + a specific version from the Library;
  choose the adversarial preset and intensity (1–3), max turns, and who starts.
- **Production fidelity**: the bot-under-test call must use the same model,
  temperature and system prompt as production. The prompt content and version
  number are **snapshotted into the run row** (`prompt_snapshot`,
  `version_number_snapshot`) so reports survive later version deletion.
- **Five adversarial personas as data, not code**: `caotico`, `evasivo`,
  `manipulador`, `interrogador`, `comprador` (the `runs.preset` check already
  enumerates them).
- **Live turn-by-turn rendering** of the conversation as it runs (reuse the
  provider router's `streamChat()`; resolve `test_bot` and `adversarial_lead`
  role models from Settings).
- **Judge call after the conversation ends** (role `judge`), producing JSON:
  findings by failure mode + severity (`crítico` / `medio` / `bajo`),
  hypothesis, suggested fix, edge cases, scope disclaimer.
- **Report view** rendering that JSON.

The 8 failure modes the judge looks for: salida de rol, pérdida de objetivo,
alucinación, fallo de alcance, manipulación/jailbreak, loop/estancamiento,
ruptura de tono/marca, fallo con input degradado.

## Definition of done

- From a client/version in the Library, configure a run, watch the two AIs
  converse turn by turn, and get a structured judge report at the end.
- The bot under test runs with production-identical model/temperature/prompt;
  the prompt + version number are snapshotted into the run.
- The report renders the 8-category taxonomy with severities, and persists
  (viewable later) even if the source version is deleted.

## Tickets

**To be planned.** Break the scope above into one-ticket-at-a-time units
(Conventional Commits, branch `sprint-4/ticket-X-short-name`) following the
same shape as `docs/SPRINT-3-archive.md`. Reuse prior infrastructure:

- Provider router + `streamChat()` (Sprints 2–3) for the bot/lead turns.
- Role defaults for `test_bot`, `adversarial_lead`, `judge` (already in
  `role_defaults` / Settings).
- The `runs` table and its enums already exist — **likely no new migration**,
  but planning should confirm whether `run_messages` / report storage need
  tables (check `001_initial.sql`).
- Library version selection (Sprint 1) for choosing what to test.

Open questions to resolve during planning: where turn-by-turn messages and the
judge report are persisted (existing tables vs. a new migration); how the
adversarial personas are encoded as data (preset → system-prompt builder);
the exact judge JSON schema (Zod) for the 8-category taxonomy; and how a run is
driven server-side (one long request vs. polling/stepped turns).

When Sprint 4 is done, update the "Active sprint" line in `CLAUDE.md` to point
to `docs/SPRINT-5.md`, archive this file, and create `SPRINT-5.md` from the
roadmap/spec.

# Sprint 4 — Adversarial Lab

> **Status: ✅ complete (closed 2026-06-23).** Archived. The active sprint is
> now Sprint 5 — see `docs/SPRINT-5.md`. This file is kept for reference.

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

- **Lab UI** (`/adversarial`, `/adversarial/[id]`), wired to the existing
  `runs` table (`001_initial.sql` already has it: snapshots, preset, intensity,
  configs, status). The nav already links to `/adversarial`.
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

## Decisions (locked at planning, 2026-06-23)

These resolve the open questions. Build against them.

1. **No new migration.** `runs`, `run_messages` (turn_number, role bot/lead,
   content) and `reports` (summary, findings jsonb, edge_cases jsonb,
   scope_disclaimer, one per run) all exist in `001_initial.sql`, and the
   `test_bot` / `adversarial_lead` / `judge` roles exist in `role_defaults`.
2. **Route** is `/adversarial` + `/adversarial/[id]` (matches the nav).
3. **Personas as data.** `lib/prompts/adversarial-personas.ts` maps
   `preset × intensity (1–3)` to a lead system prompt. The bot under test uses
   the **selected version's prompt** as its system prompt — no persona.
4. **Production fidelity & reproducibility.** At run creation, snapshot
   `prompt_snapshot` + `version_number_snapshot`, and capture the resolved
   model/temperature/top_p/max_tokens into `bot_config` / `lead_config` /
   `judge_config` (from `role_defaults`). Reports survive version deletion via
   the snapshots. The bot call must use the production model + temperature; the
   team sets the `test_bot` role to match production.
5. **Orchestration.** A single server route streams the conversation turn by
   turn: it alternates bot/lead via `streamChat()` up to `max_turns` (honoring
   `starter`), persisting each `run_messages` row as produced and moving
   `runs.status` pending → running → completed/error/stopped. On conversation
   end it calls the judge (non-streaming `chat()`), validates the JSON against a
   Zod schema, and writes the single `reports` row. The client renders turns
   live from the stream and loads the report on completion.
6. **Judge output** is a Zod schema for the 8-category taxonomy (severity
   `crítico`/`medio`/`bajo`, hypothesis, suggested fix per finding; edge_cases;
   scope_disclaimer), mapped onto the `reports` columns.

---

## Tickets

Bottom-up (prompts/data → API/orchestration → UI), mirroring Sprints 2–3.
Branch `sprint-4/ticket-X-short-name`; one logical change per commit.

### S4-T1 — Adversarial personas + judge prompt (data)

`lib/prompts/adversarial-personas.ts` and `lib/prompts/judge.ts`.

**Tasks**:
- Encode the 5 presets (`caotico`, `evasivo`, `manipulador`, `interrogador`,
  `comprador`) as system-prompt builders parameterized by intensity 1–3.
- Judge system prompt enumerating the 8 failure modes + a Zod schema for its
  JSON output (summary, findings[{category, severity, hypothesis, fix}],
  edge_cases[], scope_disclaimer).

**Done when**: the modules return a lead prompt per (preset, intensity) and a
judge prompt + validated output schema.

**Commits**: 1-2.

---

### S4-T2 — Runs data layer

`lib/db/runs.ts`.

**Tasks**:
- `createRun({ clientId, versionId, preset, intensity, maxTurns, starter })`:
  snapshot prompt/version, capture bot/lead/judge configs from `role_defaults`,
  status `pending`.
- `getRun(id)` (+ ordered `run_messages` + `report`), `listRuns({ clientId? })`,
  `appendRunMessage(runId, { turnNumber, role, content })`,
  `saveReport(runId, report)`, `updateRunStatus(runId, status, errorMessage?)`.

**Done when**: a quick test can create a run, append turns, save a report, and
read it all back.

**Commits**: 1-2.

---

### S4-T3 — Run config API + schema

`app/api/runs/` + `lib/schemas/runs.ts`.

**Tasks**:
- `POST /` create a run (Zod-validated: clientId, versionId, preset, intensity,
  maxTurns, starter), resolving the bot/lead/judge role models.
- `GET /?clientId=` list · `GET /[id]` run + messages + report.

**Done when**: create / list / read cycle works over HTTP.

**Commits**: 1-2.

---

### S4-T4 — Conversation orchestration endpoint (streaming)

`POST /api/runs/[id]/execute`, server-side.

**Tasks**:
- Drive the bot↔lead loop with `streamChat()` (bot system prompt =
  `prompt_snapshot`; lead = persona builder), honoring `starter` and
  `max_turns`. Stream turn-by-turn events to the client; persist each
  `run_messages` row; move status running → completed/stopped/error.

**Done when**: starting a run streams alternating bot/lead turns and persists
them with correct turn numbers and roles.

**Commits**: 1-2.

---

### S4-T5 — Judge call + report persistence

Extend the execute flow (or `POST /api/runs/[id]/judge`).

**Tasks**:
- On conversation end, call the judge (non-streaming `chat()`) over the full
  transcript, validate against the T1 Zod schema, and write the single
  `reports` row. Stream a final "report ready" event.

**Done when**: a completed run has a persisted, schema-valid report.

**Commits**: 1.

---

### S4-T6 — Adversarial section: list + new-run config

`app/adversarial/page.tsx` + a new-run form.

**Tasks**:
- List existing runs (client, preset, status, date).
- New-run form: client + version picker (reads the Library), preset, intensity,
  max turns, starter. On submit, create the run and route to it.

**Done when**: I can configure and launch a run, and reopen past runs.

**Commits**: 1-2.

---

### S4-T7 — Run detail: live conversation + report view

`app/adversarial/[id]/page.tsx`.

**Tasks**:
- Read the execute stream and render turns live (bot vs. lead), with run status.
- On completion, render the report: findings grouped by category with
  severities, edge cases, scope disclaimer.

**Done when**: launching a run shows the conversation unfolding and a structured
report at the end; reopening a completed run shows both from storage.

**Commits**: 2.

---

When Sprint 4 is done, update the "Active sprint" line in `CLAUDE.md` to point
to `docs/SPRINT-5.md`, archive this file, and create `SPRINT-5.md` from the
roadmap/spec.

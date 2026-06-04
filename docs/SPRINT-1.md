# Sprint 1 — Settings + Library

**Goal**: Make the app usable for managing prompts. By end of sprint the
team can configure providers, import existing prompts, create new clients,
and edit prompts manually with version history.

**Out of scope**: AI-powered editing (Sprint 2), AI-powered creation
(Sprint 3), adversarial lab (Sprint 4), full visual polish (Sprint 5).

**Branch convention**: `sprint-1/ticket-N-short-name`. Merge to `main`
after review.

---

## Tickets

### S1-T1 — Project bootstrap & Supabase client

Set up the foundations cleanly.

**Tasks**:
- Verify the Next.js + TS scaffold from Phase 0 is on a recent version
  (Next 14+ with App Router, not Pages Router). Upgrade if outdated.
- Install runtime dependencies:
  - `@supabase/supabase-js`
  - `@tabler/icons-react`
  - `clsx`
  - `zod`
- Install dev dependencies as needed for TypeScript strict mode.
- Create `lib/supabase.ts` exporting a server-side Supabase client that
  reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from env. Use a
  singleton pattern so we don't create a new client per request.
- Add the Inter font via `next/font/google` in `app/layout.tsx`.
- Define the theme CSS variables in `app/globals.css` per
  `docs/DESIGN-SYSTEM.md`. Default `data-theme="dark"` on `<body>`.
- Create a minimal root layout with the Zebra pill logo at top-left and
  a placeholder nav row. No theme toggle yet (Sprint 5).

**Done when**: `npm run dev` (or pnpm) boots successfully, the page shows
the dark background with the logo at the top, theme variables visible in
DevTools.

**Commits**: 3 commits — bootstrap, supabase client, theme tokens.

---

### S1-T2 — Encryption utilities

API keys for LLM providers must be encrypted at rest.

**Tasks**:
- Create `lib/crypto.ts` with two exported functions:
  - `encrypt(plaintext: string): string`
  - `decrypt(ciphertext: string): string`
- Implementation: use Node's built-in `crypto` module. Algorithm
  AES-256-GCM. Derive the 32-byte key by SHA-256 hashing of
  `KEY_ENCRYPTION_SECRET`. Generate a random 12-byte IV per encrypt.
  Output format: `base64(iv):base64(ciphertext):base64(authTag)`.
- Add a unit test in `lib/crypto.test.ts` (use Node's built-in `node:test`
  or a single test file with a sample roundtrip).
- Document at the top of the file: "Rotating KEY_ENCRYPTION_SECRET will
  invalidate all previously stored ciphertexts."

**Done when**: roundtrip test passes. Can be imported from API routes.

**Commits**: 1 commit.

---

### S1-T3 — Providers data layer

DB access functions for providers, models, and role defaults.

**Tasks**:
- Create `lib/db/providers.ts` with:
  - `listProviders()` → returns providers + their models, key masked.
  - `getProvider(id)` → single row, key masked.
  - `createProvider({ name, adapter_type, base_url?, api_key, enabled })`
    → encrypts the key before insert.
  - `updateProvider(id, { ... })` → re-encrypts only if `api_key` is
    provided.
  - `deleteProvider(id)` → fails with a thrown error if any
    `role_defaults` row references it.
  - `getDecryptedKey(id)` → returns the plain key. **Only used internally
    by `lib/providers/index.ts`.** Never exposed via API.
  - `listModels(providerId)`, `addModel(providerId, { model_name,
    display_name? })`, `removeModel(modelId)`, `toggleModel(modelId,
    enabled)`.
- Create `lib/db/role-defaults.ts` with:
  - `listRoleDefaults()` → all 5 rows (test_bot, adversarial_lead, judge,
    editor, creator), each with provider name + model name resolved.
  - `setRoleDefault(role, { provider_id, model_name, temperature?,
    top_p?, max_tokens? })` → upsert by `role`.
- Mask format for keys:
  - openai/openai_compat/openrouter: `sk-…last4chars`
  - anthropic: `sk-ant-…last4chars`
  - google: `AIza…last3chars`
  - fallback: `…last4chars`

**Done when**: every function exercisable from a temporary test API route.

**Commits**: 2-3 commits.

---

### S1-T4 — Providers API routes

REST endpoints that the Settings page will hit.

**Tasks**:
- `GET /api/providers` → list, masked keys.
- `POST /api/providers` → create.
- `GET /api/providers/[id]` → single, masked.
- `PATCH /api/providers/[id]` → update (api_key optional).
- `DELETE /api/providers/[id]` → 409 if referenced by a role_default.
- `GET /api/providers/[id]/models` → list models for this provider.
- `POST /api/providers/[id]/models` → add a model.
- `PATCH /api/providers/[id]/models/[modelId]` → toggle enabled.
- `DELETE /api/providers/[id]/models/[modelId]` → remove.
- `GET /api/role-defaults` → all 5 role assignments.
- `PUT /api/role-defaults/[role]` → upsert.

All input validated via zod schemas in `lib/schemas/providers.ts`.
Errors return JSON `{ error: "Description in Spanish" }` with appropriate
status codes (400 validation, 404 not found, 409 conflict, 500 internal).

**Done when**: every endpoint testable via curl or Thunder Client end-to-end.

**Commits**: 2-3 commits.

---

### S1-T5 — Provider router (unified LLM interface)

The abstraction every LLM call goes through.

**Tasks**:
- Create `lib/providers/index.ts` with `chat()` and `streamChat()` per
  the type signature in `docs/ARCHITECTURE.md`.
- Implement 4 adapters in `lib/providers/`:
  - `openai-compat.ts` — `fetch` with OpenAI-style payloads. Honors
    `base_url` from the provider row.
  - `anthropic.ts` — uses `@anthropic-ai/sdk`. (Install on demand.)
  - `google.ts` — uses Google's official Gemini SDK. (Confirm the
    current package name at install time; the team has historically used
    `@google/generative-ai`.)
  - `openrouter.ts` — thin wrapper around openai-compat with
    `base_url: 'https://openrouter.ai/api/v1'` hardcoded.
- Token counting: return `tokensIn` and `tokensOut` from response usage
  data. Where the API doesn't provide them (some openai-compat backends
  omit them), return `0` and add a TODO comment.
- The router decrypts the API key on every call (don't cache the plain
  key in memory beyond the request scope).

**Done when**: a temporary test API route can call `chat({...})` against
each of the 4 adapter types and get a coherent response.

**Commits**: 1 commit per adapter + 1 for the router (5 total).

---

### S1-T6 — Settings page UI

The visual face of providers + role defaults.

**Tasks**:
- `app/settings/page.tsx`: list providers per design system.
- Per-provider row: name (big), adapter_type label small, masked key on
  the right, "Editar" / "Eliminar" buttons. Click row to expand → reveal
  the model list inline.
- Modal "Agregar proveedor" / "Editar proveedor": name, adapter_type
  select (4 options with Spanish labels), base_url (only shown for
  `openai_compat` and `openrouter`), api_key textarea (placeholder for
  edit shows masked existing key), enabled toggle.
- Inline model management: per-provider expanded row shows the model list
  with an inline "+ agregar modelo" input.
- Below providers section: "Asignación de roles" with 5 rows
  (test_bot, adversarial_lead, judge, editor, creator). Each row has:
  - Role label in Spanish ("Bot bajo prueba", "Lead adversarial", etc.).
  - Provider dropdown (filtered to enabled providers).
  - Model dropdown (filtered to enabled models of selected provider).
  - Number inputs: temperature, top_p (optional), max_tokens.
- Save buttons per role row (not a global save).
- All UI in Spanish, MAYÚSCULAS section labels, line-bottom inputs,
  pill buttons.

**Done when**: I can add OpenAI from the UI with my key + a model, the
key persists encrypted in DB (verify via SQL: `select api_key_encrypted
from providers`), and I can assign that model to the `editor` role.

**Commits**: 3-5 commits (page shell, provider modal, role assignments,
polish).

---

### S1-T7 — Library data layer

DB access functions for clients and versions.

**Tasks**:
- `lib/db/clients.ts`:
  - `listClients({ filter, search? })` where filter ∈ `'all' | 'production'
    | 'editing' | 'legacy' | 'archived'`. Returns each client with: latest
    version number, version count, last-update timestamp.
  - `getClient(id)` → with all versions and full content of production
    version.
  - `createClient({ name, segment?, location?, notes? })` → returns the
    new client plus a created v1.0 empty version.
  - `updateClient(id, { name?, segment?, location?, notes? })`.
  - `archiveClient(id)` (sets `archived_at = now()`) and
    `restoreClient(id)` (sets `archived_at = null`).
  - `deleteClient(id)` — hard delete; trusts the cascade in the SQL
    schema.
- `lib/db/versions.ts`:
  - `listVersions(clientId)` → all (max 5), newest first, content omitted
    to keep payload small. Add `includeContent: true` for when needed.
  - `getVersion(id)` → with content.
  - `createVersion(clientId, content, { bumpType, source, sourceSessionId?,
    versionNumberOverride? })`. Computes next number based on the latest:
    - `bumpType: 'minor'` → `vX.Y → vX.(Y+1)`
    - `bumpType: 'major'` → `vX.Y → v(X+1).0`, also unmarks any other
      production version for this client and marks this one
      `is_production = true`.
    - `bumpType: 'imported'` → uses `versionNumberOverride` directly,
      also marks `is_production = true` and `is_legacy = true` on the
      client.
  - `promoteToProduction(versionId)` → unmarks others, marks this one.

Edge case: when the trigger auto-deletes the oldest version on insert,
the response should still return the inserted version successfully.

**Done when**: smoke tests cover the happy paths and the 5-version cap
behavior. Inspect DB after each test to confirm.

**Commits**: 2-3 commits.

---

### S1-T8 — Library API routes

- `GET /api/clients?filter=...&search=...`
- `POST /api/clients` — body: name + optional fields.
- `GET /api/clients/[id]`
- `PATCH /api/clients/[id]`
- `POST /api/clients/[id]/archive` — soft archive.
- `POST /api/clients/[id]/restore`
- `DELETE /api/clients/[id]` — hard delete.
- `GET /api/clients/[id]/versions`
- `POST /api/clients/[id]/versions` — body: `{ content, bumpType, source,
  versionNumberOverride? }`.
- `GET /api/versions/[id]` — with content.
- `POST /api/versions/[id]/promote` — promote this version to production.

All input validated via zod (`lib/schemas/clients.ts`,
`lib/schemas/versions.ts`). Error responses in Spanish.

**Done when**: full CRUD exercisable via curl end-to-end.

**Commits**: 2 commits.

---

### S1-T9 — Library grid UI

The home page of the app.

**Tasks**:
- `app/library/page.tsx`: grid of ClientCard components per design system.
- Top: title "Biblioteca" + subtitle ("12 CLIENTES · 47 VERSIONES · 3
  ARCHIVADOS" computed live).
- Right side of header: buttons `+ IMPORTAR EXISTENTE` and
  `+ NUEVO CLIENTE`.
- Search input (line-bottom) below the header.
- Filter chips: TODOS · PRODUCCIÓN · EN EDICIÓN · LEGACY · ARCHIVADOS
  with live counts.
- `ClientCard` component:
  - Badge computed from data:
    - `NEW` if `created_at` within 15 days AND NOT `is_legacy`.
    - `NEW VERSION` if latest version was a major bump within 3-5 days.
    - `LEGACY` if `is_legacy`.
    - No badge otherwise.
  - Client name (18px medium, slightly tracked tight).
  - Meta line: segment · location, in UPPERCASE muted.
  - Big version number (28px, e.g. "v2.4").
  - Bottom row: "HACE X DÍAS/SEMANAS" + "N / 5 VERSIONES".
  - Three icon-only action buttons top-right: edit, copy
    (copies production version's content to clipboard with toast feedback),
    delete (opens the two-step modal).
- "Nuevo cliente" modal: name (required), segment, location, notes. On
  submit → POST `/api/clients` → redirect to `/library/[id]` (the detail
  page from S1-T10).
- "Importar existente" modal: name, segment, location, prompt content
  (large textarea), **version_number** (text input, default "v1.0",
  validates `^v\d+\.\d+$`). On submit → POST `/api/clients` then POST
  `/api/clients/[id]/versions` with `bumpType: 'imported'`. Then redirect
  to detail.
- Two-step delete modal per `docs/DESIGN-SYSTEM.md`. Step 1 has 3 buttons
  (CANCELAR, ARCHIVAR which calls archive route, CONTINUAR which goes
  to step 2). Step 2 has the typed-confirmation requiring exact client
  name match before the SÍ, ELIMINAR button activates.

**Done when**: I can create, import, archive, and delete clients from
the UI. Badges show correctly per the rules.

**Commits**: 4-6 commits (page shell, ClientCard, filters, modals,
delete flow, polish).

---

### S1-T10 — Client detail: manual editor

The textarea + autosave + finalize button.

**Tasks**:
- New migration `supabase/migrations/002_add_draft_to_clients.sql`:
  add column `clients.draft_content text` (nullable). Tell the user to
  run it.
- `app/library/[id]/page.tsx` page shows:
  - Header: client name, current production version label, last-update
    timestamp, "Copiar versión de producción" button (clipboard +
    toast).
  - Sidebar (left, ~30% width): version list (newest first), each row
    shows version number, source (manual / editor / creator / imported),
    date, "PROD" tag if production.
  - Main area (right): the editor.
    - Title: "Editando draft basado en v3.0" (or whatever the latest is).
    - Big textarea with the draft content. If no draft exists yet,
      pre-fills with current production version's content.
    - Autosave: debounced 3 seconds after last keystroke. PATCH `/api/
      clients/[id]` with `draft_content`. Show a discreet timestamp
      "Autosaved 12:04:32" under the textarea.
    - Two buttons at the bottom:
      - "Finalizar edición" (primary, yellow) — opens a small modal:
        "¿Crear nueva versión vX.Y?" with the computed next minor number.
        On confirm: POST `/api/clients/[id]/versions` with
        `bumpType: 'minor'`, `source: 'manual'`. Clear draft. Refresh
        page.
      - "Promover a producción" (secondary) — opens modal with major
        bump confirmation. On confirm: POST with `bumpType: 'major'`.
        Also clears draft.
- Empty state for a brand-new client: textarea is empty, sidebar shows
  only v1.0 (empty), the placeholder text invites starting the edit.

**Done when**: I can edit a client's prompt manually, see autosave kick
in, finalize as a new minor version, watch the 5-version cap kick in on
the 6th, and promote a major when ready.

**Commits**: 3-5 commits (migration, page layout, autosave, finalize
flow, promote flow).

---

## Definition of done for Sprint 1

- All 10 tickets merged to `main`.
- Manual end-to-end smoke test passes:
  1. Configure OpenAI + Anthropic + DeepSeek providers in Settings with
     real API keys.
  2. Assign Claude Opus to the `editor` role.
  3. Import an existing prompt from a production n8n flow with version
     v2.5.
  4. Make a manual edit (change one number).
  5. Finalize as v2.6.
  6. Promote v2.6 to production → becomes v3.0.
  7. Repeat steps 4-5 four more times → 5 versions cap is hit on the
     6th and the oldest non-production gets auto-deleted.
  8. Copy production version to clipboard.
- No console errors. No exposed keys in browser DevTools / Network tab.
- Visual polish is NOT required (that's Sprint 5). Use Tailwind or
  inline styles tuned to the tokens — skip nice transitions, fancy
  empty states, mobile responsive niceties. They land in Sprint 5.

When Sprint 1 is done, update the "Active sprint" line in `CLAUDE.md`,
archive this file (rename to `SPRINT-1-archive.md` or similar), and
create `SPRINT-2.md` from the spec.

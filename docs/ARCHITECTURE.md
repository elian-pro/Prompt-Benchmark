# Architecture

## Stack

- **Framework**: Next.js 14+ (App Router), TypeScript strict mode.
- **Database**: Supabase Postgres.
- **Storage**: Supabase Storage (private bucket `studio-uploads`).
- **Auth**: HTTP Basic Auth via EasyPanel reverse proxy. NO Supabase Auth.
- **LLM access**: server-side only, via API routes in `/app/api`.
- **Deployment**: VPS via EasyPanel.

## File structure

```
/app
  /page.tsx                    redirect to /editor
  /library/
    /page.tsx                  grid of clients
    /[id]/page.tsx             client detail (versions + manual editor)
  /editor/
    /page.tsx                  list of editor sessions
    /[id]/page.tsx             chat with Claude Opus
  /creator/
    /page.tsx                  list of creator sessions + new
    /[id]/page.tsx             chat with Claude Opus
  /adversarial/
    /page.tsx                  run config + history
    /[id]/page.tsx             run detail + report
  /settings/
    /page.tsx                  providers + role defaults
  /api/
    /clients/                  CRUD clients
      /[id]/n8n-bindings/      create/list/delete deploy targets, confirm manual, status (drift)
      /[id]/n8n-sync/          preview + push to n8n, history, revert
    /versions/                 create version, promote
    /chat-sessions/            editor and creator chats
    /runs/                     adversarial lab
    /providers/                settings, models
    /integrations/n8n/         connections CRUD, test, list workflows/agents (picker)
    /uploads/                  file upload to Storage
    /role-defaults/            per-role model assignment

/lib
  /supabase.ts                 server-side Supabase client (service_role)
  /crypto.ts                   encrypt/decrypt API keys (Node crypto, AES-256-GCM)
  /providers/
    /index.ts                  unified interface: chat() and streamChat()
    /openai-compat.ts          adapter for OpenAI-compatible APIs
    /anthropic.ts              Anthropic native adapter
    /google.ts                 Gemini native adapter
    /openrouter.ts             OpenRouter adapter (wraps openai-compat)
  /n8n/
    /client.ts                 REST client for the n8n public API, scoped to one connection
    /agent-node.ts             read/write an AI Agent node's systemMessage, locate by id/name
    /sync.ts                   push, drift check (checkDrift), revert (revertPush)
  /db/
    /clients.ts                data access for clients
    /versions.ts               data access for versions
    /chat-sessions.ts
    /runs.ts
    /providers.ts
    /n8n-connections.ts        n8n instances (encrypted API keys)
    /n8n-bindings.ts           client deploy targets (API or manual mode)
    /n8n-sync-events.ts        push/rollback/manual-confirm audit log
  /presets.ts                  adversarial personas (5)
  /failure-modes.ts            judge taxonomy (8 categories)
  /version-utils.ts            bump, compare, diff

/components
  /ui/                         primitives: Button, Card, Modal, Input, Badge
  /library/                    ClientCard, NewBadge, VersionList, ImportModal,
                                N8nBindingModal, N8nDeploymentCard, N8nSyncModal, N8nSyncHistory
  /editor/                     ChatMessage, FileUpload, FinalizeButton
  /creator/                    similar
  /adversarial/                ConversationView, ReportCard
  /settings/                   ..., N8nConnectionFormModal, N8nConnectionRow

/supabase
  /migrations/
    /001_initial.sql           deployed; never edit
    /011_n8n_sync.sql          n8n_connections, n8n_bindings, n8n_sync_events
    /0NN_*.sql                 future migrations
```

## Multi-provider adapter pattern

All LLM calls go through `lib/providers/index.ts` which exposes a unified
interface:

```typescript
type ChatRequest = {
  providerId: string;
  modelName: string;
  systemPrompt?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

type ChatResponse = {
  content: string;
  tokensIn: number;
  tokensOut: number;
};

export async function chat(req: ChatRequest): Promise<ChatResponse>;
export async function streamChat(req: ChatRequest): AsyncIterable<string>;
```

Internally `chat()` looks up the provider by `providerId`, decrypts its
API key, picks the adapter based on `adapter_type`, and dispatches.

Adapter types in DB:
- `openai_compat` — covers OpenAI, DeepSeek, Groq, Together, Mistral,
  Fireworks, xAI, Cerebras, and most new providers. Just needs base_url
  + key.
- `anthropic` — Anthropic native SDK.
- `google` — Gemini native SDK.
- `openrouter` — uses openai_compat internally, with OpenRouter's base_url
  hardcoded.

**Adding a new provider** that uses an existing adapter type = a row in
`providers` + rows in `provider_models`. No code change. Adding a new
adapter type = a new file in `lib/providers/` + new dispatch case.

## Versioning rules

- Versions stored in `versions` table, one row per version.
- `version_number` is a text field formatted `vMAJOR.MINOR`.
- **Minor bump** (`v3.0 → v3.1`) is the default on every "Finalizar
  edición". Happens whether the edit was manual or via Editor chat. At `.9`
  the minor rolls over to the next integer (`v2.9 → v3.0`), so the minor
  never passes one digit.
- **Manual version numbers.** The auto-bump is only a default: the finalize
  modal exposes an editable `vX.Y` field, and an existing version's number
  can be renamed inline in the Library sidebar
  (`PATCH /api/versions/[id]` with `versionNumber`, or
  `versionNumberOverride` on create). Added for beta, when prompts are often
  updated outside the app and the number has to be set by hand.
  `createVersion()` honors an explicit override for any bump type;
  `updateVersionNumber()` renames a row and re-syncs its markers (below).
  No uniqueness is enforced on `(client_id, version_number)`.
- **"Promover a producción" does not create a version.** It only moves the
  `is_production` tag to the client's latest version (unmarking any other).
  The old behavior (a major bump creating `v(X+1).0`) was dropped — the
  `major` bump type survives in the API/schema for old rows, but no UI
  triggers it anymore.
- **Max 5 versions per client** enforced by trigger
  `enforce_version_limit()` in `001_initial.sql`. On the 6th insert, the
  oldest non-production version is deleted automatically.
- **One production version per client max** enforced by unique partial
  index `unique_production_per_client`.
- When a version is created from a chat session, `source_session_id`
  links back to that session so the chat history can be reopened later.
- **`change_summary`** (migration 007, nullable) stores the Editor's
  natural-language "CAMBIOS REALIZADOS" — the prose after the fenced block,
  captured at finalize via `extractChangeSummary()` (strips bold and the
  boilerplate "SIN CAMBIOS" tail). The Library detail page shows it per
  version. Only Editor-chat versions have one; manual edits, imports, and
  Creator's first version are null (the UI shows "Primera versión" for the
  oldest, a neutral placeholder otherwise).
- **The prompt's own text is kept in sync with its version number.**
  `syncVersionMarkers()` (`lib/version-utils.ts`) deterministically edits the
  content (string ops, never the model, since the Editor persona is forbidden
  from touching version text) so a prompt copied out for n8n is always
  identifiable by version. Given the number being saved it: (1) rewrites the
  `vX.Y` token in the title (the first heading), or appends ` vX.Y` if the
  title has none; (2) removes the old dedicated `"Versión: X.Y"` line, which
  the team dropped in favor of the title token; (3) regenerates a closing
  footer mirroring the title with a `FIN DEL ` prefix, e.g.
  `# FIN DEL PROMPT ... v1.4`, as the last line. So the title carries the
  version and a matching footer bookends the prompt. Idempotent. A prompt
  with no heading at all (a corner case) gets a bare `vX.Y` line at the top
  and no footer. This runs in `createVersion()` (Editor finalize, manual
  Library edit, imports), `updateVersionNumber()` (inline rename), and
  `createClient()`'s seed insert when it carries real content (Creator
  finalize).

## Editable system prompts

The three personas — Editor (`lib/prompts/editor-persona.ts`), Creator
(`lib/prompts/creator-persona.ts`) and the Adversarial judge
(`lib/prompts/judge.ts`) — ship as code constants but can be overridden
from **Settings → System prompts**.

- Overrides live in `prompt_overrides` (migration 006), one row per role
  (`editor` / `creator` / `judge`). A row's `content` replaces the code
  constant; no row = the code default is used.
- The `build*SystemPrompt()` helpers take an optional override and fall
  back to their constant. The API routes fetch it via
  `getPromptOverride(role)` per request: the Editor/Creator messages route
  and the Adversarial execute route.
- For Editor/Creator the override is only the **persona** — the app still
  appends the dynamic part per request (the client's draft / the reference
  prompt). The judge has no dynamic part, so its override is used verbatim.
- "Restaurar original" deletes the row (`DELETE /api/prompt-overrides/:role`).

## Adversarial run snapshots

When an Adversarial Lab run is created, the run row stores:
- `prompt_snapshot` — full text of the prompt at the moment of testing.
- `version_number_snapshot` — the version label at that moment.

This means even if the source version is later auto-deleted by the
5-version limit, the run report remains fully legible. The FK
`runs.version_id` uses `ON DELETE SET NULL`.

## Playground conversation rounds

Sprint 8 (`012_playground_rounds.sql`). A Playground session can be reset or
have its version switched without losing notes. Instead of deleting messages
(which would leave `demo_notes.message_ids` dangling), the conversation is
versioned into rounds:

- `demo_sessions.current_round` is the active round. Reset bumps it;
  switching version bumps it too (fresh comparison). `demo_messages.round`
  tags each message; `demo_messages.version_number_snapshot` records which
  version produced it.
- `getSession()` returns only the current round's messages for the chat, plus
  `note_messages`: the rows any note references that live in an older round,
  so a note's bubble preview keeps resolving. Old rounds are never deleted.
- Notes are session-scoped, not round-scoped, so they persist across resets.
  A note referencing an older round is shown but its "jump to message" is
  inert (that message isn't in the current view).
- Switching version is refused server-side once the session has any notes
  (`VersionSwitchBlockedError` → 409); the UI locks the picker with an "i"
  hint. This keeps every note attributable to a single version without
  tracking version per note.

Display: `parseTurnBubbles()` (`lib/adversarial-message.ts`) splits a turn's
readable text into WhatsApp-style bubbles (one per line break / `mensajes`
array item); the Playground renders the stack with the estado on the last
bubble. Tagging stays at the turn (message row) level.

## n8n prompt sync

Sprint 7. "Promover a producción" can also deploy the prompt straight into
the n8n workflow node it lives in, so pasting it by hand becomes optional
instead of the only path. Schema in `011_n8n_sync.sql`; the client-facing
plan (context, rejected alternatives, open decisions) is
`docs/N8N-SYNC-PLAN.md`.

**Structural facts this design relies on**: every client prompt lives in a
node of type `@n8n/n8n-nodes-langchain.agent`, in
`parameters.options.systemMessage`. A workflow can hold more than one AI
Agent node, so the app never guesses which one belongs to a client, the
user picks the workflow and the specific node when binding.

**Three tables**, all in `011_n8n_sync.sql`:
- `n8n_connections`: reachable n8n instances (base URL + encrypted API
  key). Zebra's own instance is one row; a client's instance can be added
  the same way if they ever share credentials. Multi-instance from the
  first migration, not bolted on later.
- `n8n_bindings`: a client's deploy targets, one row per target. Two
  modes, enforced by a `check` constraint:
  - `mode = 'api'`: `connection_id` + `workflow_id` + `node_id` (the
    node's stable n8n id, `node_name` cached for a name-fallback lookup
    and for display). Deployed by the app.
  - `mode = 'manual'`: just `manual_label` (free text, e.g. "n8n de
    Kuyabeh, flujo WhatsApp"). Deployed by a human, outside the app,
    because the app has no credentials for that instance.
  - Both modes share `last_deployed_version_id` and `last_deployed_at`:
    written by a successful push (api) or by "Marcar como actualizado"
    (manual). This is the one field the "pending deploy" reminder reads:
    a manual binding is pending when it differs from the client's current
    production version. `last_pushed_hash` (api only) is the sha256 of
    the raw systemMessage last written, used for drift detection.
- `n8n_sync_events`: audit log of every push, rollback, drift detection
  and manual confirmation. A successful push's `previous_content` is the
  node's exact raw value before the write, which is what "Revertir" plays
  back; n8n's own workflow version history is an enterprise feature, so
  this table is the only rollback source available.

**`lib/n8n/agent-node.ts`** is pure (no network, no DB) and does the part
that needs care: n8n expression handling. A `systemMessage` string that
starts with `=` is an n8n expression, and its `{{ ... }}` segments are
interpolated at runtime (e.g. to inject the lead's name); the app must
preserve that marker on every write (`expression_prefix` on the binding)
and never blindly overwrite it. `computePushWarnings()` flags two cases
before a push: the live node interpolates data the new prompt doesn't
carry (would silently break personalization), or the new prompt contains
literal `{{ }}` while the field is an expression (n8n would try to
evaluate them). `locateBoundAgent()` finds the bound node by `node_id`,
falling back to `node_name` if the workflow was rebuilt by hand (ids
change, names usually survive); the caller re-confirms and refreshes the
stored id on a name match. All of this is unit-tested directly
(`agent-node.test.ts`).

**`lib/n8n/client.ts`** wraps the n8n REST API (`X-N8N-API-KEY` header)
for one connection: list workflows, get one, update one, test the
connection. n8n's `PUT /workflows/{id}` replaces the whole workflow (no
partial update), so `sanitizeForUpdate()` strips read-only fields
(`id`, `active`, timestamps, `tags`, ...) before every write.

**`lib/n8n/sync.ts`** is the engine, three operations:
- `previewPush(binding, nextText)`: read-only. Locates the node, computes
  warnings, and returns current vs. next text plus the workflow's
  `versionId` at read time, for the confirmation diff.
- `pushBinding(binding, version, options)`: fresh read, mutate only the
  target node in memory, write back immediately. If
  `expectedWorkflowVersionId` is given and the live workflow's
  `versionId` no longer matches it, the push aborts (someone edited the
  flow in n8n while the user was looking at the diff). Snapshots the
  previous raw text, records the new hash on the binding, logs the event.
- `checkDrift(binding)`: read-only, compares the live node's hash against
  `last_pushed_hash` to detect a hand-edit in n8n since the last push.
  A binding that was created but never pushed reports `no_baseline`
  ("Sin verificar"), not an error.
- `revertPush(binding, event)`: writes an event's `previous_content` back
  verbatim (`setRawSystemMessage`, no re-derivation from
  `expression_prefix`, since the stored value already has any `=` marker
  baked in). Clears `last_deployed_version_id` on the binding: the
  restored text predates whatever version was live, so it isn't
  attributable to a known version.

**Deploy flow**: promoting a version (`POST /api/versions/[id]/promote`)
only ever flips `is_production` in `versions`, unchanged since before this
sprint. The client detail page separately checks whether the client has
any bindings and, if so, opens a confirmation modal: a diff per API
binding (with warnings, and the option to skip unchanged targets) and a
copy-and-confirm affordance per manual binding. A partial failure never
rolls back the promotion, since the Studio's own state already changed;
a failed API binding is retryable, an unconfirmed manual binding stays
"Pendiente" until the human confirms.

**API routes**, all server-side, all under `/api/clients/[id]/`:
`n8n-bindings` (CRUD, `mode` in the POST body selects api vs. manual),
`n8n-bindings/[bindingId]/confirm` (manual "Marcar como actualizado"),
`n8n-bindings/status` (drift check for every API binding), `n8n-sync/
preview` and `n8n-sync` (push), `n8n-sync/history` and `n8n-sync/
[eventId]/revert`. Picker helpers live under `/api/integrations/n8n/`:
list connections, list a connection's workflows, list a workflow's AI
Agent nodes (with a prompt preview, since a workflow can have more than
one).

## Uploads TTL

- Editor / Creator file attachments go to Supabase Storage bucket
  `studio-uploads`.
- The `uploads` table tracks them with `expires_at = created_at + 7 days`.
- A daily `pg_cron` job calls `cleanup_expired_uploads()` to remove
  expired DB rows.
- **Important**: the cron job alone only cleans the DB. The application
  must also delete the actual file from Storage. Pattern: when an upload
  row is deleted (cron or otherwise), the API route that triggered the
  cleanup also issues a `storage.from('studio-uploads').remove([path])`.
- Chat conversations are kept indefinitely. Only the file attachments
  expire.

## Security model

- **Network perimeter**: EasyPanel HTTP Basic Auth in front of the app.
  Two `user:password` pairs configured at the reverse proxy level. The
  app is invisible to anyone without the credentials. HTTPS is mandatory
  (EasyPanel handles Let's Encrypt automatically).

- **In-app auth**: none. The 2 users share one workspace.

- **Supabase access**: all calls use the `service_role` key from the
  server side. This bypasses RLS. RLS policies are still set permissive
  (`to authenticated`) as defense in depth — if the app is ever
  accidentally exposed without Basic Auth, anonymous calls are still
  blocked at the DB layer.

- **API key encryption**: stored in `providers.api_key_encrypted` and,
  since Sprint 7, `n8n_connections.api_key_encrypted`, both encrypted with
  AES-256-GCM using Node's built-in `crypto` module. The encryption key is
  derived from `KEY_ENCRYPTION_SECRET` env var via SHA-256. Random 12-byte
  IV per encryption, stored alongside ciphertext. Format:
  `base64(iv):base64(ciphertext):base64(authTag)`. An n8n API key can
  rewrite every workflow in that instance, not just prompts, so the sync
  engine (`lib/n8n/sync.ts`) only ever calls `GET`/`PUT` on a single
  workflow, never exercising the rest of what the key can do.

- **Rotation**: rotating `KEY_ENCRYPTION_SECRET` invalidates all stored
  keys. Document this loudly in `crypto.ts`.

- **Never on the client**: `.env` is gitignored. The service_role key,
  LLM API keys, and encryption secret never reach the browser. UI calls
  the app's own `/api/...` routes; the routes call external services.

## Env vars

See `.env.example`. Required at runtime:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side full-access key |
| `KEY_ENCRYPTION_SECRET` | 32+ byte secret for AES-256-GCM |
| `NEXT_PUBLIC_BUILD_TAG` | Optional; shown in footer |

No env var was added for n8n sync: connection URLs and API keys are saved
through the Settings UI into `n8n_connections`, encrypted with the same
`KEY_ENCRYPTION_SECRET` as everything else, the same way LLM provider keys
already work.

## What lives where: cheat sheet

| Concern | Layer |
|---|---|
| LLM API call | `/app/api/...` route → `lib/providers` |
| Encrypt a provider key before save | `/app/api/providers` → `lib/crypto.ts` |
| Read clients list | `/app/api/clients` → `lib/db/clients.ts` |
| Render the Library grid | `/app/library/page.tsx` → fetch from `/api/clients` |
| Show a ClientCard | `/components/library/ClientCard.tsx` |
| Theme tokens | `app/globals.css` (CSS variables on `[data-theme]`) |
| Schema change | new file in `/supabase/migrations/` |
| Push a prompt to n8n | `/api/clients/[id]/n8n-sync` → `lib/n8n/sync.ts` |
| Read/write an AI Agent's prompt | `lib/n8n/agent-node.ts` |
| Encrypt an n8n connection key | `/app/api/integrations/n8n` → `lib/db/n8n-connections.ts` |

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
    /versions/                 create version, promote
    /chat-sessions/            editor and creator chats
    /runs/                     adversarial lab
    /providers/                settings, models
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
  /db/
    /clients.ts                data access for clients
    /versions.ts               data access for versions
    /chat-sessions.ts
    /runs.ts
    /providers.ts
  /presets.ts                  adversarial personas (5)
  /failure-modes.ts            judge taxonomy (8 categories)
  /version-utils.ts            bump, compare, diff

/components
  /ui/                         primitives: Button, Card, Modal, Input, Badge
  /library/                    ClientCard, NewBadge, VersionList, ImportModal
  /editor/                     ChatMessage, FileUpload, FinalizeButton
  /creator/                    similar
  /adversarial/                ConversationView, ReportCard

/supabase
  /migrations/
    /001_initial.sql           deployed; never edit
    /002_*.sql                 future migrations
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
- **Minor bump** (`v3.0 → v3.1`) on every "Finalizar edición". Happens
  whether the edit was manual or via Editor chat. At `.9` the minor rolls
  over to the next integer (`v2.9 → v3.0`), so the minor never passes one
  digit.
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

- **API key encryption**: stored in `providers.api_key_encrypted`,
  encrypted with AES-256-GCM using Node's built-in `crypto` module. The
  encryption key is derived from `KEY_ENCRYPTION_SECRET` env var via
  SHA-256. Random 12-byte IV per encryption, stored alongside ciphertext.
  Format: `base64(iv):base64(ciphertext):base64(authTag)`.

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

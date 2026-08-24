/**
 * Naming rules for a client's conversation history in the chats Postgres.
 *
 * Since the August 2026 migration the history is NOT a chats_<Cliente> table in
 * a Supabase project any more: it is one SCHEMA per client, each holding a
 * single table called `chats`: "Sofía".chats, "Bad Boys Toys".chats. The
 * schema is named after the client the way the rest of that database names its
 * clients: the real name, with its spaces and accents.
 *
 * ponytail: the module, the exported names and clients.chats_table still say
 * "table" while they now carry a SCHEMA name. Renaming would touch 12 files
 * including UI and a column; the meaning is documented here instead. Rename it
 * if the confusion ever costs more than the churn would.
 *
 * Pure module (no pg, no Supabase) so the Nuevo cliente modal can preview the
 * name in the browser while the user types.
 */

/**
 * Kept for compatibility with anything still matching the OLD chats_* table
 * names. A clients.chats_table value that still looks like this has not been
 * migrated to a schema name yet.
 */
export const CHATS_TABLE_RE = /^chats_[A-Za-z0-9_]+$/;

/** True for a legacy chats_<Cliente> value, i.e. one migration 021 missed. */
export function isLegacyChatsTable(name: string): boolean {
  return CHATS_TABLE_RE.test(name);
}

/** Postgres truncates identifiers past this, silently addressing another one. */
export const MAX_IDENT_BYTES = 63;

/**
 * Schema names carry spaces and accents, so they can NOT be validated with a
 * charset regex the way chats_* names were: they are always double-quoted
 * instead (see quoteIdent). What is left to check is what quoting cannot cover:
 * the 63-byte truncation, control characters (a NUL would end the statement
 * mid-string), and stray outer whitespace, which is always a copy/paste slip
 * and would otherwise create a second, near-invisible schema.
 */
export function isValidChatsTable(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (!name || name.trim() !== name) return false;
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  return new TextEncoder().encode(name).length <= MAX_IDENT_BYTES;
}

/**
 * Quotes an identifier for interpolation into DDL/DML. Doubling the inner quote
 * is what makes it injection-proof: `a"; drop schema x; --` becomes the single
 * harmless identifier "a""; drop schema x; --". Throws instead of emitting
 * something Postgres would truncate or misparse.
 */
export function quoteIdent(name: string): string {
  if (!isValidChatsTable(name)) {
    throw new Error(`Identificador no válido: ${JSON.stringify(name)}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * The schema name suggested for a client: its own name, trimmed. Returns null
 * when nothing usable is left, so callers can disable the option instead of
 * building an invalid identifier.
 *
 * No accent-stripping any more: "Sofía" is the schema, not chats_Sofia.
 */
export function chatsTableName(clientName: string): string | null {
  const name = clientName.trim().replace(/\s+/g, " ");
  return isValidChatsTable(name) ? name : null;
}

/** The single table inside every client schema. */
export const CHATS_TABLE = "chats";

/**
 * Guards `turnos` against arriving double-encoded.
 *
 * n8n sends every field value as a string, so an expression returning
 * JSON.stringify([...]) can land as a jsonb STRING containing the JSON instead
 * of a jsonb array, and nothing can be queried out of that shape:
 *
 *   jsonb_typeof(turnos) -> "string"
 *   turnos               -> "[{\\"rol\\":\\"bot\\",...}]"
 *
 * That is what happened on the old Supabase project, where PostgREST received
 * the value as a JSON string. The pg driver casts text to jsonb instead, so it
 * should not recur, but the trigger costs nothing and is a no-op when the value
 * already arrives as an array. A malformed value is left exactly as it came
 * rather than raising: `turnos` is a convenience column and the agents' write
 * must never fail because of it, the conversation is in `historial` either way.
 */
export const TURNOS_TRIGGER_FN = `create or replace function public.normalize_turnos()
returns trigger language plpgsql as $fn$
begin
  if jsonb_typeof(new.turnos) = 'string' then
    begin
      new.turnos := (new.turnos #>> '{}')::jsonb;
    exception when others then
      null;  -- not valid JSON inside the string: keep it, do not break the write
    end;
  end if;
  return new;
end;
$fn$;`;

/**
 * The fixed DDL for a new client's history: the schema, the table, the lookup
 * index and the grants. Byte-identical in shape to the schemas the agent flows
 * already write to, so a provisioned client behaves like a migrated one.
 *
 * Idempotent throughout (`if not exists`), so a retry over an existing schema
 * succeeds without touching its rows. The identifier is validated and quoted,
 * so nothing user-authored reaches the database as SQL.
 *
 * n8n_writer is the role the agent flows connect as; metabase_app is read-only
 * for reporting. Both already exist in that database.
 */
export function buildCreateChatsTableSql(schemaName: string): string {
  const q = quoteIdent(schemaName);
  return `create schema if not exists ${q};
create table if not exists ${q}.${CHATS_TABLE} (
  id                 bigint generated by default as identity primary key,
  id_de_kommo        text not null,
  historial          text,
  turnos             jsonb,
  numero_de_mensajes integer,
  created_at         timestamptz not null default now()
);
create index if not exists chats_kommo_idx on ${q}.${CHATS_TABLE} (id_de_kommo);
${TURNOS_TRIGGER_FN}
drop trigger if exists turnos_normalize on ${q}.${CHATS_TABLE};
create trigger turnos_normalize before insert or update on ${q}.${CHATS_TABLE}
  for each row execute function public.normalize_turnos();
grant usage on schema ${q} to n8n_writer, metabase_app;
grant select, insert, update on ${q}.${CHATS_TABLE} to n8n_writer;
grant usage, select on all sequences in schema ${q} to n8n_writer;
grant select on ${q}.${CHATS_TABLE} to metabase_app;`;
}

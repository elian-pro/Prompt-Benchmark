/**
 * Read-only access to the conversation-history Postgres (the VPS), where the
 * agents store real client/lead conversations.
 *
 * One SCHEMA per client, each with a single table `chats`, one row per
 * conversation:
 *   id, created_at, numero_de_mensajes, id_de_kommo (Kommo CRM lead id),
 *   historial (the full conversation as plain text: "User: ...\nIA: ..."),
 *   turnos (the same conversation as one object per turn).
 * Rows written before the flows started filling `turnos` have it null; those
 * are reconstructed from historial by lib/conversation-turns.ts.
 *
 * Until August 2026 this lived in a second Supabase project as one
 * chats_<Cliente> table per client, read over PostgREST. The data moved; the
 * function names and return shapes did not, so callers are unchanged. What
 * `chatsTable` holds now is a SCHEMA name (see lib/chats-table-name.ts).
 *
 * Client names do not always match schema names, so the mapping stays explicit
 * in clients.chats_table (migration 018, values migrated in 021). This module
 * never writes.
 */
import { chatsQuery } from "../chats-db";
import { isChatsConfigured } from "../supabase";
// The validator lives in the pure chats-table-name module so the same rule
// guards the identifier here and the DDL that provisioning sends.
import { isValidChatsTable, quoteIdent, CHATS_TABLE } from "../chats-table-name";
import { isDateOnly, nextDay, searchFilterFor } from "../history-filters";

export { isValidChatsTable };

export type ChatsTable = { table: string; rows: number };

export type ConversationRow = {
  id: number;
  created_at: string;
  numero_de_mensajes: number | string | null;
  id_de_kommo: string | null;
  historial: string | null;
  /** jsonb, so the driver hands it back already parsed. Null on rows written
   *  by a flow that did not fill it yet. Shape validated in
   *  lib/conversation-turns.ts. */
  turnos: unknown;
};

export type ConversationPage = {
  rows: ConversationRow[];
  total: number;
  hasMore: boolean;
};

/** The columns every read returns, in a fixed order. */
const COLUMNS = "id, created_at, numero_de_mensajes, id_de_kommo, historial, turnos";

/**
 * `id` is a bigint, and the pg driver hands int8 back as a STRING so a value
 * past 2^53 does not lose precision on the way in. These ids are identity
 * counters in the low millions, and everything downstream treats
 * `ConversationRow.id` as the number this type declares: `z.number()` on the
 * case routes, `===` in the UI. Narrowing happens here, at the one place a row
 * is born, instead of at each reader. Skipping it is what made saving a note
 * in Replay answer "Datos inválidos: Expected number, received string".
 */
function asRow(row: ConversationRow): ConversationRow {
  return { ...row, id: Number(row.id) };
}

/**
 * Lists the client schemas that hold a conversation table, with an approximate
 * row count. Used by the "connect history" picker and the new-client
 * auto-match.
 *
 * The count is pg_class.reltuples, an estimate that costs nothing; an exact
 * count(*) per schema would mean one sequential scan each. reltuples is -1 on a
 * table that was never analyzed, hence the greatest(...,0).
 */
export async function listChatsTables(): Promise<ChatsTable[]> {
  const rows = await chatsQuery<{ schema_name: string; row_estimate: string }>(
    `select n.nspname as schema_name,
            greatest(c.reltuples, 0)::bigint::text as row_estimate
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and c.relname = $1
        and n.nspname not in ('pg_catalog', 'information_schema')
        and n.nspname not like 'pg\\_%'
      order by n.nspname`,
    [CHATS_TABLE],
  );
  return rows
    .map((r) => ({ table: r.schema_name, rows: Number(r.row_estimate ?? 0) }))
    .filter((t) => isValidChatsTable(t.table));
}

/**
 * Every schema a client could live in, whether or not it already has a `chats`
 * table.
 *
 * listChatsTables only sees schemas that already hold conversations, which is
 * right for the history picker and wrong for provisioning: a client can have
 * had a schema in that database for months (its 12 reporting tables) and no
 * conversation table yet. Creating a client from its name alone then made a
 * SECOND schema whose name differed only in case, "ARKAI" beside "Arkai", and
 * the client's data ended up split across both.
 *
 * Only the true system schemas are excluded. The shared ones (ops, crm, mart,
 * ads) are left in on purpose: matchChatsTable requires an exact normalized
 * match against the client name, so they can never be picked, and a hardcoded
 * denylist would rot the first time a shared schema is added.
 */
export async function listClientSchemas(): Promise<string[]> {
  const rows = await chatsQuery<{ nspname: string }>(
    `select nspname from pg_namespace
      where nspname not like 'pg\\_%'
        and nspname not in ('information_schema', 'public')
      order by nspname`,
  );
  return rows.map((r) => r.nspname).filter(isValidChatsTable);
}

/**
 * The schema a client's conversations belong in: the existing one whose name
 * matches, or null when there is none and a new one has to be created.
 *
 * Matching on the normalized name is what stops a second schema appearing over
 * a difference in capitalization or accents. The name returned is the one the
 * database already uses, never the client's spelling, so the `chats` table
 * lands beside the client's other tables.
 *
 * Never throws: provisioning must not fail because this lookup could not run.
 */
export async function resolveClientSchema(clientName: string): Promise<string | null> {
  if (!isChatsConfigured()) return null;
  try {
    return matchChatsTable(clientName, await listClientSchemas());
  } catch {
    return null;
  }
}

export type HistoryFilters = {
  /** One box, three meanings: a Kommo lead id, our own row id, or free text. */
  search?: string;
  /** Date-only (yyyy-mm-dd) or a full timestamp. `to` is inclusive of the day. */
  from?: string;
  to?: string;
  /** Conversations with at most this many messages: the cheapest "the lead
   *  left early" filter there is. */
  maxMessages?: number;
};

/**
 * Reads one page of a client's conversation history, newest first.
 *
 * The schema name is validated and quoted (it cannot be a bound parameter);
 * every value is a real $n placeholder. count(*) over() gives the total in the
 * same round trip as the page, which is what PostgREST's `count: exact` used
 * to provide.
 *
 * There is no filter for the conversation's final estado yet. It is reachable
 * through `search` because the flows write the state into `historial` too
 * ("se mueve a humano"), which is imprecise but works on every row. The precise
 * version is `turnos @> '[{"estado": X}]'`, worth doing now that every client
 * flow writes the column.
 */
export async function getClientHistory(
  chatsTable: string,
  { limit, offset, ...filters }: { limit: number; offset: number } & HistoryFilters,
): Promise<ConversationPage> {
  if (!isValidChatsTable(chatsTable)) {
    throw new Error("Tabla de historial no válida.");
  }
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown) => `$${params.push(value)}`;

  const search = filters.search ? searchFilterFor(filters.search) : null;
  if (search?.kind === "text") {
    where.push(`historial ilike ${add(`%${search.value}%`)}`);
  } else if (search?.kind === "numeric") {
    // Digits can be the Kommo lead id, our own row id, or appear mid-transcript.
    const alts = [`id_de_kommo = ${add(search.value)}`, `historial ilike ${add(`%${search.value}%`)}`];
    if (search.includeId) alts.unshift(`id = ${add(search.value)}::bigint`);
    where.push(`(${alts.join(" or ")})`);
  }
  if (filters.from) where.push(`created_at >= ${add(filters.from)}`);
  if (filters.to) {
    where.push(
      isDateOnly(filters.to)
        ? `created_at < ${add(nextDay(filters.to))}`
        : `created_at <= ${add(filters.to)}`,
    );
  }
  if (filters.maxMessages != null) {
    where.push(`numero_de_mensajes <= ${add(filters.maxMessages)}`);
  }

  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const from = `from ${quoteIdent(chatsTable)}.${CHATS_TABLE} ${clause}`;
  // The filter params are shared by both queries below, so the page params are
  // appended to a copy: pushing them into `params` would corrupt the count.
  const pageParams = [...params, limit, offset];
  const rows = await chatsQuery<ConversationRow & { total_count: string }>(
    `select ${COLUMNS}, count(*) over() as total_count
       ${from}
      order by created_at desc, id desc
      limit $${pageParams.length - 1} offset $${pageParams.length}`,
    pageParams,
  );
  const clean = rows.map(({ total_count: _drop, ...row }) => asRow(row as ConversationRow));

  // count(*) over() rides along with the page for free, but it only comes back
  // when the page has rows. An empty page still has to report the real total
  // (an offset past the end must not claim the total IS the offset), so that
  // one case pays for a separate count.
  const total = clean.length
    ? Number(rows[0].total_count)
    : Number(
        (await chatsQuery<{ n: string }>(`select count(*)::text as n ${from}`, params))[0]?.n ?? 0,
      );
  return { rows: clean, total, hasMore: offset + clean.length < total };
}

/**
 * One conversation by its row id. Read fresh at the moment a case is filed, so
 * the snapshot stored with the case is what the agents had actually written by
 * then, not whatever the list happened to be showing.
 */
export async function getConversation(
  chatsTable: string,
  rowId: number,
): Promise<ConversationRow | null> {
  if (!isValidChatsTable(chatsTable)) {
    throw new Error("Tabla de historial no válida.");
  }
  const rows = await chatsQuery<ConversationRow>(
    `select ${COLUMNS} from ${quoteIdent(chatsTable)}.${CHATS_TABLE} where id = $1`,
    [rowId],
  );
  return rows[0] ? asRow(rows[0]) : null;
}

/** Strip accents/spaces/punctuation and lowercase, for name comparison. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the schema whose name matches a client name exactly once, after
 * normalizing. Returns null on no match or an ambiguous match, so
 * auto-suggestion never guesses wrong.
 *
 * Normalizing makes the accents and spaces of a schema name irrelevant, so the
 * client "Bad Boys Toys" finds the schema "Bad Boys Toys". It does NOT do
 * partial matches: a client named "Veronica Lozano" whose schema is "Verónica
 * Lozano Hermosillo" falls through to null and is connected by hand, which is
 * the intended behavior.
 *
 * The chats_ prefix is still stripped so a not-yet-migrated value keeps
 * matching.
 */
export function matchChatsTable(clientName: string, available: string[]): string | null {
  const target = normalize(clientName);
  if (!target) return null;
  const hits = available.filter((t) => normalize(t.replace(/^chats_/, "")) === target);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Best-effort auto-match for a newly created client. Never throws and never
 * blocks client creation: if the chats DB is not configured or unreachable, it
 * silently returns null and the client is left unconnected.
 */
export async function suggestChatsTable(clientName: string): Promise<string | null> {
  if (!isChatsConfigured()) return null;
  try {
    const tables = await listChatsTables();
    return matchChatsTable(clientName, tables.map((t) => t.table));
  } catch {
    return null;
  }
}

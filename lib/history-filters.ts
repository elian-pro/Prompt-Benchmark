/**
 * Pure helpers for searching a client's conversation history.
 *
 * Kept out of lib/db/chats-history.ts (which pulls in the Supabase client) so
 * the branching here can be unit-tested directly, same reasoning as
 * lib/chats-table-name.ts.
 */

/** What a search box entry should become, once decided. */
export type SearchFilter =
  /** A single `.ilike` on a column: supabase-js encodes the value. */
  | { kind: "ilike"; column: string; pattern: string }
  /** A PostgREST `or=(...)` filter string, already assembled. */
  | { kind: "or"; filter: string };

/** `id` is a bigint. A longer run of digits overflows and errors the whole
 *  query instead of simply not matching, so it is left out of the filter. */
const MAX_BIGINT_DIGITS = 18;

/**
 * The support flow starts with what the client says, and a client never says
 * "row 412": they say the lead. So one box covers the three ways a lead can be
 * named. A run of digits is a Kommo id or our own row id (and may also appear
 * inside the transcript); anything else is free text matched against
 * `historial`, which is where the lead's name is written.
 *
 * Only digits are ever interpolated into the `or` filter. Free text goes
 * through `ilike`, where the value is encoded as a parameter. Keep it that
 * way: a comma or a paren inside an `or` string breaks PostgREST's parser, and
 * a lead's message is full of both.
 */
export function searchFilterFor(raw: string): SearchFilter | null {
  const q = raw.trim();
  if (!q) return null;
  if (!/^\d+$/.test(q)) return { kind: "ilike", column: "historial", pattern: `%${q}%` };

  const parts = [`id_de_kommo.eq.${q}`, `historial.ilike.*${q}*`];
  if (q.length <= MAX_BIGINT_DIGITS) parts.unshift(`id.eq.${q}`);
  return { kind: "or", filter: parts.join(",") };
}

/** True for a date with no time, as an `<input type="date">` produces. */
export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * The day after a date-only string. A `to` of "2026-07-30" has to include
 * everything that happened during the 30th, so it is used as an exclusive
 * upper bound of the 31st rather than an inclusive bound of midnight.
 */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

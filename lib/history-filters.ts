/**
 * Pure helpers for searching a client's conversation history.
 *
 * Kept out of lib/db/chats-history.ts (which pulls in the Supabase client) so
 * the branching here can be unit-tested directly, same reasoning as
 * lib/chats-table-name.ts.
 */

/** What a search box entry should become, once decided. */
export type SearchFilter =
  /** Free text, matched case-insensitively against `historial`. */
  | { kind: "text"; value: string }
  /** A run of digits: a Kommo lead id, and possibly our own row id too. */
  | { kind: "numeric"; value: string; includeId: boolean };

/** `id` is a bigint. A longer run of digits overflows the cast and errors the
 *  whole query instead of simply not matching, so it is left out. */
const MAX_BIGINT_DIGITS = 18;

/**
 * The support flow starts with what the client says, and a client never says
 * "row 412": they say the lead. So one box covers the three ways a lead can be
 * named. A run of digits is a Kommo id or our own row id (and may also appear
 * inside the transcript); anything else is free text matched against
 * `historial`, which is where the lead's name is written.
 *
 * The caller turns this into SQL with bound parameters. Nothing here is ever
 * interpolated: a lead's message is full of quotes and parens.
 */
export function searchFilterFor(raw: string): SearchFilter | null {
  const q = raw.trim();
  if (!q) return null;
  if (!/^\d+$/.test(q)) return { kind: "text", value: q };
  return { kind: "numeric", value: q, includeId: q.length <= MAX_BIGINT_DIGITS };
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

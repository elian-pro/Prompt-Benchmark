/**
 * The notification log's pure parts, kept out of the bell component so they can
 * be tested without a DOM.
 *
 * The log is local to the browser and starts empty: it records what happens
 * from the moment the feature ships, not what already happened. Nothing here
 * touches the database, and there is no shared history across devices.
 * ponytail: per-browser localStorage log. A `notifications` table (per user,
 * with read state) is the upgrade if the team needs the same history on two
 * machines or wants it to survive clearing site data.
 */
/** What produced the entry, which is all the bell needs to pick its icon.
 *  Optional on `NotifEntry`: entries logged before this shipped are already in
 *  localStorage without it and still render, just without an icon. */
export type NotifKind = "editor" | "creator" | "note";

export type NotifEntry = {
  /** Stable per event, so a re-poll of the same fact never logs it twice. */
  id: string;
  at: number;
  text: string;
  href: string;
  kind?: NotifKind;
  /** The one substring of `text` worth reading first, normally the client
   *  name. Stored rather than parsed out later: only the writer knows which
   *  words are the name. */
  emphasis?: string;
};

export const LOG_KEY = "zebra-notif-log";
export const LOG_CAP = 50;

/** Newest first, deduped by id, capped. Older entries fall off the end. */
export function pushLog(log: NotifEntry[], entries: NotifEntry[]): NotifEntry[] {
  const known = new Set(log.map((e) => e.id));
  const fresh = entries.filter((e) => !known.has(e.id));
  return fresh.length === 0 ? log : [...fresh, ...log].slice(0, LOG_CAP);
}

/** Turns that were running when we last looked and are not running now, which
 *  is how a finished generation is detected: the poll only reports what is
 *  still in flight. */
export function finishedTurns<T extends { sessionId: string }>(seen: T[], current: T[]): T[] {
  const running = new Set(current.map((t) => t.sessionId));
  return seen.filter((t) => !running.has(t.sessionId));
}

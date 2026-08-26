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
/** A month back is as far as anyone has looked. Two limits, not one: the cap
 *  keeps a busy week from filling the panel, this keeps a quiet month from
 *  leaving stale entries at the bottom of it. */
export const LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Newest first, deduped by id, capped, and without anything older than
 *  `LOG_MAX_AGE_MS`. Returns the very same array when nothing changed, so the
 *  caller can skip a pointless write. */
export function pushLog(
  log: NotifEntry[],
  entries: NotifEntry[],
  now: number = Date.now(),
): NotifEntry[] {
  const known = new Set(log.map((e) => e.id));
  const fresh = entries.filter((e) => !known.has(e.id));
  const next = [...fresh, ...log]
    .filter((e) => now - e.at <= LOG_MAX_AGE_MS)
    .slice(0, LOG_CAP);
  return fresh.length === 0 && next.length === log.length ? log : next;
}

const TITLE_RE = /la respuesta de (.+) está lista\.$/;

/** Fills in what an entry written before `kind` and `emphasis` existed cannot
 *  carry. The sentences are ours (see the bell), so reading one back to find
 *  out which section wrote it is safe, and an entry that matches nothing just
 *  keeps the plain text it already had. */
function decorate(entry: NotifEntry): NotifEntry {
  if (entry.kind) return entry;
  const kind: NotifKind = entry.text.startsWith("Creator:")
    ? "creator"
    : entry.text.startsWith("Editor:")
      ? "editor"
      : "note";
  return { ...entry, kind, emphasis: entry.emphasis ?? TITLE_RE.exec(entry.text)?.[1] };
}

/** The log as read back from storage: whatever was there, decorated, pruned
 *  and capped. Anything that is not an array reads as an empty log. */
export function restoreLog(raw: unknown, now: number = Date.now()): NotifEntry[] {
  const parsed = Array.isArray(raw) ? (raw as NotifEntry[]) : [];
  return pushLog([], parsed.map(decorate), now);
}

/** Turns that were running when we last looked and are not running now, which
 *  is how a finished generation is detected: the poll only reports what is
 *  still in flight. */
export function finishedTurns<T extends { sessionId: string }>(seen: T[], current: T[]): T[] {
  const running = new Set(current.map((t) => t.sessionId));
  return seen.filter((t) => !running.has(t.sessionId));
}

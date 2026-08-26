/**
 * The other half of a quote.
 *
 * A note tags the message that went wrong, which is almost always the bot's
 * answer. On its own that answer is half the story: it was a reply to
 * something, and without that something the Editor is reading a verdict with
 * no evidence. This derives the missing half at read time.
 *
 * Derived, not stored, on purpose. `demo_notes.message_ids` is what the UI
 * highlights (`is-selected`, `chat-check`, the pins) and what a client sees
 * quoted back in their own report card. Writing the counterpart in there would
 * light up a message nobody picked, and would show the client that their words
 * were attached to a complaint they did not attach them to. Deriving also means
 * every note written before this shipped gains its pair for free.
 */
import type { DemoMessageRow } from "./db/demo-sessions";

export type QuotedMessage = {
  /** The tagged id, kept even when it no longer resolves, so a caller can say
   *  "(mensaje no disponible)" instead of silently dropping the quote. */
  id: string;
  message: DemoMessageRow | null;
  /** True when this message was derived rather than tagged by a person. */
  isContext: boolean;
};

/** Chronological order within a conversation. `turn_number` restarts each
 *  round, so the round leads. */
function inOrder(a: DemoMessageRow, b: DemoMessageRow): number {
  return a.round - b.round || a.turn_number - b.turn_number;
}

/**
 * The message that caused `m`, or that `m` caused.
 *
 * A bot answer pairs backwards with the lead message that prompted it; a lead
 * message pairs forwards with the answer it got. Never leaves the round: after
 * a reset the conversation starts over, and the last message of round 1 did not
 * prompt the first of round 2.
 *
 * `null` is a normal answer, not a failure: the opening greeting has nothing
 * before it, and a lead message still waiting on the bot has nothing after it.
 */
export function counterpartOf(
  m: DemoMessageRow,
  all: DemoMessageRow[],
): DemoMessageRow | null {
  const round = all
    .filter((o) => o.session_id === m.session_id && o.round === m.round && o.id !== m.id)
    .sort(inOrder);
  if (m.role === "bot") {
    return round.filter((o) => o.role === "human" && o.turn_number < m.turn_number).at(-1) ?? null;
  }
  return round.find((o) => o.role === "bot" && o.turn_number > m.turn_number) ?? null;
}

/**
 * A note's quotes in reading order: what was said, then what the bot answered,
 * each one marked as tagged or as derived context.
 *
 * A message the person tagged is never downgraded to context, even when it is
 * also somebody else's counterpart, and never appears twice. Ids that no longer
 * resolve keep their place at the end rather than vanishing.
 */
export function quotedWithContext(
  messageIds: string[],
  all: DemoMessageRow[],
): QuotedMessage[] {
  const byId = new Map(all.map((m) => [m.id, m]));
  const tagged = messageIds.map((id) => byId.get(id) ?? null);
  const taggedIds = new Set(messageIds);

  const shown = new Map<string, QuotedMessage>();
  for (const m of tagged) {
    if (!m) continue;
    shown.set(m.id, { id: m.id, message: m, isContext: false });
  }
  for (const m of tagged) {
    if (!m) continue;
    const other = counterpartOf(m, all);
    if (!other || taggedIds.has(other.id) || shown.has(other.id)) continue;
    shown.set(other.id, { id: other.id, message: other, isContext: true });
  }

  const resolved = [...shown.values()].sort((a, b) => inOrder(a.message!, b.message!));
  const missing = messageIds
    .filter((id) => !byId.has(id))
    .map((id) => ({ id, message: null, isContext: false }));
  return [...resolved, ...missing];
}

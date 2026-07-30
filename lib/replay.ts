/**
 * Rebuilding a real conversation so a candidate prompt can answer the turn
 * that failed.
 *
 * Two things make this less obvious than replaying a transcript:
 *
 * 1. **The bot's own turns have to go back as the JSON envelope it emitted**
 *    ({"estado": ..., "mensajes": [...]}), not as plain text. A model follows
 *    the format of its own previous answers far more closely than a rule
 *    buried thousands of tokens up the prompt, so feeding plain text makes it
 *    drop the envelope and the replay stops resembling production. This is the
 *    same failure `asEnvelope` fixes for the Playground's opening message.
 *
 * 2. **One reply is several turns.** The bot answers with an array of
 *    messages, stored as one turn each. The reply that failed is therefore the
 *    whole contiguous run of bot turns, and the history has to be cut before
 *    the run starts, not before the tagged turn.
 *
 * Pure module (no DB, no network) so the reconstruction can be unit-tested.
 */
import type { ConversationTurn } from "./conversation-turns";

export type ReplayMessage = { role: "user" | "assistant"; content: string };

export type ReplayPlan = {
  /** The conversation as the bot saw it, up to the failing reply. */
  messages: ReplayMessage[];
  /** The reply that failed: every bot turn of that run, in order. */
  original: ConversationTurn[];
};

/** One envelope per contiguous run of bot turns, the way the bot emitted it.
 *  The estado is whichever the run carries; the turns of one reply share it. */
function envelopeOf(run: ConversationTurn[]): string {
  const estado = run.find((t) => t.estado)?.estado ?? null;
  const mensajes = run.map((t) => t.texto).filter((t) => t.length > 0);
  return JSON.stringify(estado ? { estado, mensajes } : { mensajes });
}

/**
 * Where the failing reply begins. The tagged turn is normally one bubble of a
 * multi-bubble answer, so walk back over the bot turns it belongs to. Tagging
 * a lead message instead means "the answer to this was wrong", so the run
 * starts right after it.
 */
function replyStart(turns: ConversationTurn[], failedAt: number): number {
  if (turns[failedAt]?.rol === "lead") return failedAt + 1;
  let start = failedAt;
  while (start > 0 && turns[start - 1].rol === "bot") start--;
  return start;
}

/**
 * Splits a conversation at the failing reply: what to send as history, and
 * what the bot actually answered so the two can be compared.
 *
 * `sistema` turns are dropped: a state transition is a record of what the flow
 * did, never something the model said or was told.
 */
export function buildReplayPlan(turns: ConversationTurn[], failedAt: number): ReplayPlan {
  const start = replyStart(turns, failedAt);

  const original: ConversationTurn[] = [];
  for (let i = start; i < turns.length && turns[i].rol === "bot"; i++) {
    original.push(turns[i]);
  }

  const messages: ReplayMessage[] = [];
  let run: ConversationTurn[] = [];
  const flush = () => {
    if (run.length === 0) return;
    messages.push({ role: "assistant", content: envelopeOf(run) });
    run = [];
  };

  for (const turn of turns.slice(0, start)) {
    if (turn.rol === "sistema") continue;
    if (turn.rol === "bot") {
      run.push(turn);
      continue;
    }
    flush();
    messages.push({ role: "user", content: turn.texto });
  }
  flush();

  return { messages, original };
}

/**
 * True when the plan can actually be run. A history whose last message is the
 * bot's own leaves nothing to answer, which happens when the tagged turn is
 * the very first thing in the conversation (the opening message): there is no
 * lead input to react to, so there is nothing to replay.
 */
export function isReplayable(plan: ReplayPlan): boolean {
  return plan.messages.at(-1)?.role === "user";
}

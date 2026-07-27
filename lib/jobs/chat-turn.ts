/**
 * In-process registry of chat turns that are still generating.
 *
 * Editor and Creator rewrite the client's whole prompt on every turn, which can
 * take minutes. Tying that work to the HTTP request meant navigating away from
 * the page killed the generation and discarded the user's message. This
 * registry decouples the two: a request starts a job and then merely subscribes
 * to it, so a client that leaves only unsubscribes while the generation runs to
 * completion and persists itself.
 *
 * Deliberately generic. It knows how to run a detached async function, buffer
 * its text and fan it out; it knows nothing about drafts, versions or
 * providers. That domain logic stays in the route, which passes it in as `run`.
 *
 * ponytail: plain module-level Map, single replica only. A second EasyPanel
 * replica would make in-flight turns invisible to its peers, which needs a
 * DB-backed status column plus sticky routing (or a real queue). Pin the Map to
 * globalThis if dev HMR ever duplicates the module.
 */

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "done"; truncated: boolean; draftBroken: boolean }
  | { type: "cancelled" }
  | { type: "error"; message: string };

export type TurnMode = "editor" | "creator";

/**
 * The work itself. Receives the job's abort signal (fired by `stopTurn`, never
 * by a dropped connection) and an emitter for incremental text. Resolves with
 * the terminal event, and is expected not to reject: the route's own catch
 * turns provider failures into `{type:"error"}` after salvaging partial text.
 */
export type TurnRunner = (
  signal: AbortSignal,
  emit: (text: string) => void,
) => Promise<TurnEvent>;

export type TurnJob = {
  sessionId: string;
  /** Only used to label the global chip and its completion toast. */
  mode: TurnMode;
  title: string;
  /** Reply accumulated so far, replayed to a subscriber that arrives late. */
  text: string;
  /** Set once the runner resolves. The job is dropped from the registry at the
   *  same moment, but a subscriber holding this reference still reads it, which
   *  closes the race between `startTurn` and the first `turnStream`. */
  terminal: TurnEvent | null;
  subscribers: Set<(evt: TurnEvent) => void>;
  cancel: AbortController;
};

export class TurnInFlightError extends Error {
  constructor() {
    super("Ya hay una respuesta en curso en esta sesión.");
    this.name = "TurnInFlightError";
  }
}

const jobs = new Map<string, TurnJob>();

export function getTurn(sessionId: string): TurnJob | undefined {
  return jobs.get(sessionId);
}

/** The sessions currently generating, for the global header chip. */
export function listTurns(): Array<{ sessionId: string; mode: TurnMode; title: string }> {
  return [...jobs.values()].map(({ sessionId, mode, title }) => ({ sessionId, mode, title }));
}

/** Signals the runner to stop. Idempotent: stopping a turn that already
 *  finished is a no-op, not an error, because the client's stop button always
 *  races the last token. */
export function stopTurn(sessionId: string): void {
  jobs.get(sessionId)?.cancel.abort();
}

function broadcast(job: TurnJob, evt: TurnEvent) {
  for (const subscriber of job.subscribers) {
    try {
      subscriber(evt);
    } catch {
      // One dead connection must not stop the others from being fed.
    }
  }
}

/**
 * Registers a job and starts it detached from the caller, so the route can
 * return its response immediately while generation continues in the process.
 * Throws TurnInFlightError if this session is already generating.
 */
export function startTurn(input: {
  sessionId: string;
  mode: TurnMode;
  title: string;
  run: TurnRunner;
}): TurnJob {
  if (jobs.has(input.sessionId)) throw new TurnInFlightError();

  const job: TurnJob = {
    sessionId: input.sessionId,
    mode: input.mode,
    title: input.title,
    text: "",
    terminal: null,
    subscribers: new Set(),
    cancel: new AbortController(),
  };
  jobs.set(job.sessionId, job);

  const finish = (evt: TurnEvent) => {
    job.terminal = evt;
    // Dropped before the broadcast: the assistant message is already persisted
    // by the runner at this point, so a client reconnecting a moment later gets
    // a 204 and reads the finished turn from the database instead of finding a
    // phantom job that would keep the chip lit and 409 the next message.
    jobs.delete(job.sessionId);
    broadcast(job, evt);
    job.subscribers.clear();
  };

  // Detached on purpose: not awaited, so the request that started it returns
  // while this keeps running.
  void input
    .run(job.cancel.signal, (text) => {
      job.text += text;
      broadcast(job, { type: "text", text });
    })
    .then(finish, (err: unknown) =>
      finish({
        type: "error",
        message: err instanceof Error ? err.message : "La generación falló.",
      }),
    );

  return job;
}

/**
 * Subscribes to a job, replaying whatever it has produced so far. Returns the
 * unsubscribe function, and calls `onEnd` once the turn reaches its terminal
 * event (immediately if it already has).
 */
export function subscribeTurn(
  job: TurnJob,
  onEvent: (evt: TurnEvent) => void,
): () => void {
  if (job.text) onEvent({ type: "text", text: job.text });
  if (job.terminal) {
    onEvent(job.terminal);
    return () => {};
  }
  job.subscribers.add(onEvent);
  return () => {
    job.subscribers.delete(onEvent);
  };
}

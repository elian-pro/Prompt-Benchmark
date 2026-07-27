/**
 * Unit tests for the in-flight turn registry (no DB, no provider).
 * Run with: node --test --experimental-strip-types lib/jobs/chat-turn.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  startTurn,
  stopTurn,
  getTurn,
  listTurns,
  subscribeTurn,
  TurnInFlightError,
  type TurnEvent,
} from "./chat-turn.ts";

/** A runner the test drives by hand: resolve `emitted` to feed text, resolve
 *  `finish` to end the turn. */
function controllable(id: string) {
  let emit!: (text: string) => void;
  let signal!: AbortSignal;
  let end!: (evt: TurnEvent) => void;
  const started = new Promise<void>((resolve) => {
    const job = startTurn({
      sessionId: id,
      mode: "editor",
      title: "Cliente",
      run: (s, e) =>
        new Promise<TurnEvent>((resolveRun) => {
          signal = s;
          emit = e;
          end = resolveRun;
          resolve();
        }),
    });
    void job;
  });
  return {
    started,
    emit: (text: string) => emit(text),
    end: (evt: TurnEvent) => end(evt),
    get signal() {
      return signal;
    },
  };
}

/** Lets the detached runner's promise chain settle. */
const settle = () => new Promise((r) => setImmediate(r));

test("a second turn for the same session is refused", async () => {
  const job = controllable("s1");
  await job.started;
  assert.throws(
    () => startTurn({ sessionId: "s1", mode: "editor", title: "x", run: async () => ({ type: "cancelled" }) }),
    TurnInFlightError,
  );
  job.end({ type: "done", truncated: false, draftBroken: false });
  await settle();
});

test("a late subscriber receives the text generated before it attached", async () => {
  const job = controllable("s2");
  await job.started;
  job.emit("hola ");
  job.emit("mundo");

  const seen: TurnEvent[] = [];
  subscribeTurn(getTurn("s2")!, (evt) => seen.push(evt));
  assert.deepEqual(seen, [{ type: "text", text: "hola mundo" }]);

  // And keeps receiving live deltas after the replay.
  job.emit("!");
  assert.deepEqual(seen.at(-1), { type: "text", text: "!" });

  job.end({ type: "done", truncated: false, draftBroken: false });
  await settle();
  assert.deepEqual(seen.at(-1), { type: "done", truncated: false, draftBroken: false });
});

test("a finished turn leaves the registry but stays readable through its job", async () => {
  const job = controllable("s3");
  await job.started;
  job.emit("listo");
  const handle = getTurn("s3")!;
  job.end({ type: "done", truncated: false, draftBroken: false });
  await settle();

  assert.equal(getTurn("s3"), undefined, "dropped from the registry");
  assert.deepEqual(listTurns(), [], "no longer counts as generating");

  // A subscriber that arrives in the gap still gets the whole story.
  const seen: TurnEvent[] = [];
  subscribeTurn(handle, (evt) => seen.push(evt));
  assert.deepEqual(seen, [
    { type: "text", text: "listo" },
    { type: "done", truncated: false, draftBroken: false },
  ]);
});

test("stopTurn fires the runner's signal and is idempotent once finished", async () => {
  const job = controllable("s4");
  await job.started;
  assert.equal(job.signal.aborted, false);
  stopTurn("s4");
  assert.equal(job.signal.aborted, true);

  job.end({ type: "cancelled" });
  await settle();
  stopTurn("s4"); // no throw: the stop button always races the last token
});

test("a runner that rejects still terminates the job", async () => {
  startTurn({
    sessionId: "s5",
    mode: "creator",
    title: "Cliente",
    run: async () => {
      throw new Error("proveedor caído");
    },
  });
  await settle();
  assert.equal(getTurn("s5"), undefined);
});

test("listTurns reports what is generating right now", async () => {
  const a = controllable("s6");
  const b = controllable("s7");
  await Promise.all([a.started, b.started]);
  assert.deepEqual(
    listTurns().map((t) => t.sessionId).sort(),
    ["s6", "s7"],
  );
  a.end({ type: "done", truncated: false, draftBroken: false });
  await settle();
  assert.deepEqual(listTurns().map((t) => t.sessionId), ["s7"]);
  b.end({ type: "done", truncated: false, draftBroken: false });
  await settle();
});

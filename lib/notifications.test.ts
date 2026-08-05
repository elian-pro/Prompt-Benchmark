/**
 * Run with: node --test --experimental-strip-types lib/notifications.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pushLog, finishedTurns, LOG_CAP, type NotifEntry } from "./notifications.ts";

const entry = (id: string): NotifEntry => ({ id, at: 1, text: id, href: "/" });

test("pushLog puts the new entry first and drops one already logged", () => {
  const log = pushLog([entry("a")], [entry("b")]);
  assert.deepEqual(
    log.map((e) => e.id),
    ["b", "a"],
  );
  assert.equal(pushLog(log, [entry("a")]), log);
});

test("pushLog caps the log, keeping the newest", () => {
  const full = Array.from({ length: LOG_CAP }, (_, i) => entry(`old-${i}`));
  const log = pushLog(full, [entry("new")]);
  assert.equal(log.length, LOG_CAP);
  assert.equal(log[0].id, "new");
  assert.equal(log.at(-1)?.id, `old-${LOG_CAP - 2}`);
});

test("finishedTurns returns what stopped running, not what still is", () => {
  const seen = [{ sessionId: "s1" }, { sessionId: "s2" }];
  assert.deepEqual(finishedTurns(seen, [{ sessionId: "s2" }]), [{ sessionId: "s1" }]);
  assert.deepEqual(finishedTurns(seen, seen), []);
});

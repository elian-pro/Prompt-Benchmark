/**
 * Run with: node --test --experimental-strip-types lib/notifications.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pushLog,
  restoreLog,
  finishedTurns,
  LOG_CAP,
  LOG_MAX_AGE_MS,
  type NotifEntry,
} from "./notifications.ts";

const NOW = Date.parse("2026-08-26T12:00:00Z");
const entry = (id: string, at: number = NOW): NotifEntry => ({ id, at, text: id, href: "/" });

test("pushLog puts the new entry first and drops one already logged", () => {
  const log = pushLog([entry("a")], [entry("b")], NOW);
  assert.deepEqual(
    log.map((e) => e.id),
    ["b", "a"],
  );
  assert.equal(pushLog(log, [entry("a")], NOW), log);
});

test("pushLog caps the log, keeping the newest", () => {
  const full = Array.from({ length: LOG_CAP }, (_, i) => entry(`old-${i}`));
  const log = pushLog(full, [entry("new")], NOW);
  assert.equal(log.length, LOG_CAP);
  assert.equal(log[0].id, "new");
  assert.equal(log.at(-1)?.id, `old-${LOG_CAP - 2}`);
});

test("finishedTurns returns what stopped running, not what still is", () => {
  const seen = [{ sessionId: "s1" }, { sessionId: "s2" }];
  assert.deepEqual(finishedTurns(seen, [{ sessionId: "s2" }]), [{ sessionId: "s1" }]);
  assert.deepEqual(finishedTurns(seen, seen), []);
});

test("pushLog drops what aged out, even with nothing new to add", () => {
  const old = entry("old", NOW - LOG_MAX_AGE_MS - 1);
  const log = pushLog([entry("fresh"), old], [], NOW);
  assert.deepEqual(
    log.map((e) => e.id),
    ["fresh"],
  );
});

test("restoreLog gives an old entry the kind and name its sentence implies", () => {
  const raw = [
    { id: "1", at: NOW, href: "/editor/x", text: "Editor: la respuesta de Arkai está lista." },
    { id: "2", at: NOW, href: "/creator/y", text: "Creator: la respuesta de Bad Boys Toys está lista." },
    { id: "3", at: NOW, href: "/lab/demo", text: "Ramon Losa dejó un reporte." },
  ];
  const log = restoreLog(raw, NOW);
  assert.deepEqual(
    log.map((e) => [e.kind, e.emphasis]),
    [
      ["editor", "Arkai"],
      ["creator", "Bad Boys Toys"],
      ["note", undefined],
    ],
  );
});

test("restoreLog prunes by age and survives junk in storage", () => {
  const raw = [entry("keep"), entry("gone", NOW - LOG_MAX_AGE_MS - 1)];
  assert.deepEqual(
    restoreLog(raw, NOW).map((e) => e.id),
    ["keep"],
  );
  assert.deepEqual(restoreLog(null, NOW), []);
});

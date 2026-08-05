/**
 * Run with: node --test --experimental-strip-types lib/db/conversation-cases.test.ts
 *
 * Only the pure part. getSupabase reads its env lazily, so importing the module
 * needs no database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { replayCutFor } from "./conversation-cases.ts";

const turns = [
  { rol: "lead" }, // 0
  { rol: "bot" }, // 1
  { rol: "lead" }, // 2
  { rol: "bot" }, // 3
];

test("the earliest marked bot turn is the cut", () => {
  assert.equal(replayCutFor([3, 1], turns), 1);
});

// "After this message the bot got it wrong" is how half the notes are written:
// they point at what should have been answered, not at the answer.
test("a note marking only lead messages cuts at the earliest of them", () => {
  assert.equal(replayCutFor([2], turns), 2);
  assert.equal(replayCutFor([2, 0], turns), 0);
});

test("a bot turn wins over an earlier lead turn", () => {
  assert.equal(replayCutFor([0, 3], turns), 3);
});

test("a note marking nothing has no cut", () => {
  assert.equal(replayCutFor([], turns), null);
});

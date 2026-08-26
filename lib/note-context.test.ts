/**
 * Run with: node --test --experimental-strip-types lib/note-context.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { counterpartOf, quotedWithContext } from "./note-context.ts";
import type { DemoMessageRow } from "./db/demo-sessions.ts";

/** A conversation shaped like a real one: the bot opens, the lead answers, the
 *  bot replies in three bubbles, all in round 1. Round 2 is a fresh start. */
const msg = (
  id: string,
  role: "human" | "bot",
  turn: number,
  round = 1,
  session = "s1",
): DemoMessageRow =>
  ({
    id,
    session_id: session,
    turn_number: turn,
    round,
    role,
    content: id,
    tool_calls: null,
    version_number_snapshot: null,
    created_at: "2026-08-26T12:00:00Z",
  }) as DemoMessageRow;

const CHAT = [
  msg("greeting", "bot", 1),
  msg("lead-1", "human", 2),
  msg("bot-a", "bot", 3),
  msg("bot-b", "bot", 4),
  msg("bot-c", "bot", 5),
  msg("lead-2", "human", 6),
  msg("r2-greeting", "bot", 1, 2),
  msg("r2-lead", "human", 2, 2),
];
const at = (id: string) => CHAT.find((m) => m.id === id)!;

test("a bot bubble pairs back to the lead message that prompted the turn", () => {
  assert.equal(counterpartOf(at("bot-a"), CHAT)?.id, "lead-1");
  // Not just the first bubble: any of them points at the same trigger.
  assert.equal(counterpartOf(at("bot-c"), CHAT)?.id, "lead-1");
});

test("a lead message pairs forward to the answer it got", () => {
  assert.equal(counterpartOf(at("lead-1"), CHAT)?.id, "bot-a");
});

test("the opening greeting has no pair, and neither does an unanswered lead", () => {
  assert.equal(counterpartOf(at("greeting"), CHAT), null);
  assert.equal(counterpartOf(at("lead-2"), CHAT), null);
});

test("pairing never crosses a round", () => {
  // A reset starts the conversation over: round 1 did not prompt round 2.
  assert.equal(counterpartOf(at("r2-greeting"), CHAT), null);
  assert.equal(counterpartOf(at("r2-lead"), CHAT), null);
});

test("quoting a bot answer brings the lead message with it, in reading order", () => {
  const quotes = quotedWithContext(["bot-b"], CHAT);
  assert.deepEqual(
    quotes.map((q) => [q.id, q.isContext]),
    [
      ["lead-1", true],
      ["bot-b", false],
    ],
  );
});

test("a message the person tagged is never downgraded to context or repeated", () => {
  const quotes = quotedWithContext(["bot-a", "lead-1"], CHAT);
  assert.deepEqual(
    quotes.map((q) => [q.id, q.isContext]),
    [
      ["lead-1", false],
      ["bot-a", false],
    ],
  );
});

test("two bubbles of the same turn share one context line", () => {
  const quotes = quotedWithContext(["bot-a", "bot-c"], CHAT);
  assert.deepEqual(
    quotes.map((q) => q.id),
    ["lead-1", "bot-a", "bot-c"],
  );
});

test("an id that no longer resolves keeps its place instead of vanishing", () => {
  const quotes = quotedWithContext(["bot-a", "gone"], CHAT);
  assert.deepEqual(
    quotes.map((q) => [q.id, q.message === null]),
    [
      ["lead-1", false],
      ["bot-a", false],
      ["gone", true],
    ],
  );
});

test("a message from another session is never anyone's pair", () => {
  const other = msg("other-lead", "human", 2, 1, "s2");
  assert.equal(counterpartOf(at("bot-a"), [...CHAT, other])?.id, "lead-1");
});

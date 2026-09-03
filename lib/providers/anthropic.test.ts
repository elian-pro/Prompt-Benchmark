import { test } from "node:test";
import assert from "node:assert/strict";

import { baseParams } from "./anthropic.ts";
import type { ChatMessage } from "./types.ts";

/**
 * Multi-turn caching moves the cache_control breakpoint to the newest
 * non-volatile message each turn. For the cache to actually be READ on turn
 * N+1, the prefix Anthropic cached at turn N's breakpoint must reappear
 * byte-identical (minus cache_control itself) in turn N+1's request: same
 * message, same content shape. If a message renders differently depending on
 * whether it currently holds the breakpoint, the prefix hash changes and
 * every turn after the first is a cache miss dressed up as a cache write.
 */
test("a message keeps the same content shape whether or not it currently holds the cache breakpoint", () => {
  const msgA: ChatMessage = { role: "user", content: "hola, ayudame con el prompt" };
  const msgB: ChatMessage = { role: "assistant", content: "claro, dime que cambiar" };

  // Turn 1: msgA is the newest non-volatile message, so it holds the breakpoint.
  const turn1 = baseParams({
    providerId: "anthropic",
    modelName: "claude-opus-4",
    messages: [msgA],
    cache: true,
  });

  // Turn 2: msgA is now history, msgB (the reply + new turn) holds the breakpoint.
  const turn2 = baseParams({
    providerId: "anthropic",
    modelName: "claude-opus-4",
    messages: [msgA, msgB],
    cache: true,
  });

  const contentAtTurn1 = turn1.messages[0].content;
  const contentAtTurn2 = turn2.messages[0].content;

  // Same block shape (array of text blocks) both times: only the
  // cache_control marker is allowed to move, never the underlying structure.
  assert.equal(Array.isArray(contentAtTurn1), Array.isArray(contentAtTurn2));

  const stripCacheControl = (content: unknown) =>
    JSON.parse(
      JSON.stringify(content, (key, value) => (key === "cache_control" ? undefined : value)),
    );
  assert.deepEqual(stripCacheControl(contentAtTurn1), stripCacheControl(contentAtTurn2));
});

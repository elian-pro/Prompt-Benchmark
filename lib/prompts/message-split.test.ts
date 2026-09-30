/**
 * Unit tests for the message-split contract (no DB/API required).
 * Run with: node --test --experimental-strip-types lib/prompts/message-split.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_MENSAJES, MESSAGE_SPLIT_CONTRACT } from "./message-split.ts";
import { buildEditorSystemPrompt } from "./editor-persona.ts";
import { buildCreatorSystemPrompt } from "./creator-persona.ts";

test("the contract states the limit", () => {
  assert.equal(MAX_MENSAJES, 2);
  assert.ok(MESSAGE_SPLIT_CONTRACT.includes("Máximo 2 elementos"));
});

// The model copies examples more faithfully than rules: one example with three
// bubbles would teach the old behavior back.
test("no example in the contract exceeds the limit", () => {
  const examples = MESSAGE_SPLIT_CONTRACT.split("\n").filter((l) => l.startsWith('{"estado"'));
  assert.ok(examples.length > 0);
  for (const line of examples) {
    const { mensajes } = JSON.parse(line) as { mensajes: string[] };
    assert.ok(mensajes.length <= MAX_MENSAJES, line);
  }
});

test("both personas carry the contract, even with an override", () => {
  assert.ok(buildEditorSystemPrompt().includes(MESSAGE_SPLIT_CONTRACT));
  assert.ok(buildCreatorSystemPrompt("prompt base").includes(MESSAGE_SPLIT_CONTRACT));
  assert.ok(buildEditorSystemPrompt("otra persona").includes(MESSAGE_SPLIT_CONTRACT));
  assert.ok(buildCreatorSystemPrompt("base", "otra persona").includes(MESSAGE_SPLIT_CONTRACT));
});

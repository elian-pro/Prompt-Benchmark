/**
 * Unit tests for the Editor/Creator output-contract helpers (no DB/API required).
 * Run with: node --test --experimental-strip-types lib/prompts/editor-persona.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractPromptFromReply, hasUnclosedFence } from "./editor-persona.ts";

test("extractPromptFromReply reads the fenced block", () => {
  const reply = "Aquí tienes el prompt:\n```\nEl contenido del prompt\n```\n\n**CAMBIOS:** ninguno";
  assert.equal(extractPromptFromReply(reply), "El contenido del prompt");
});

test("extractPromptFromReply returns null with no fence (a clarifying question)", () => {
  assert.equal(extractPromptFromReply("¿A qué sección te refieres exactamente?"), null);
});

test("extractPromptFromReply returns null on a cut-off (unclosed) fence", () => {
  const reply = "```\nEl contenido del prompt que se corta a la mitad";
  assert.equal(extractPromptFromReply(reply), null);
});

test("hasUnclosedFence is false for a normal reply with no fence", () => {
  assert.equal(hasUnclosedFence("¿A qué sección te refieres exactamente?"), false);
});

test("hasUnclosedFence is false for a properly closed fence", () => {
  assert.equal(hasUnclosedFence("```\ncontenido\n```"), false);
});

test("hasUnclosedFence is true when the reply is cut off mid-block", () => {
  assert.equal(hasUnclosedFence("```\ncontenido que se corta"), true);
});

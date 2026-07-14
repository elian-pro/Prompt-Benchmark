/**
 * Unit tests for the Editor/Creator output-contract helpers (no DB/API required).
 * Run with: node --test --experimental-strip-types lib/prompts/editor-persona.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractPromptFromReply,
  splitPromptBlock,
  replacePromptBlock,
  hasUnclosedPromptBlock,
  extractChangeSummary,
  PROMPT_START,
  PROMPT_END,
} from "./editor-persona.ts";

// A prompt that itself contains ```json blocks: the exact shape that broke the
// old non-greedy extractor (it truncated at the first inner fence).
const PROMPT_WITH_FENCES = [
  "# PROMPT CONVERSACIONAL - COCO IA",
  "```json",
  '{ "estado": "por-perfilar", "mensajes": ["Hola"] }',
  "```",
  "### LOS 7 ESTADOS",
  "Texto final del prompt.",
].join("\n");

function sentinelReply(prompt: string, summary: string): string {
  return `${PROMPT_START}\n${prompt}\n${PROMPT_END}\n\n${summary}`;
}

test("extracts a sentinel-delimited prompt that contains inner ```json fences", () => {
  const reply = sentinelReply(PROMPT_WITH_FENCES, "**CAMBIOS REALIZADOS:**\n- algo");
  assert.equal(extractPromptFromReply(reply), PROMPT_WITH_FENCES);
});

test("splitPromptBlock keeps the whole prompt in the block, summary in after", () => {
  const reply = sentinelReply(PROMPT_WITH_FENCES, "**CAMBIOS REALIZADOS:**\n- algo");
  const { before, block, after } = splitPromptBlock(reply);
  assert.equal(before.trim(), "");
  assert.equal(block, PROMPT_WITH_FENCES);
  assert.match(after, /CAMBIOS REALIZADOS/);
  // The inner json must NOT have leaked past the block into `after`.
  assert.doesNotMatch(after, /LOS 7 ESTADOS/);
});

test("change summary does not leak the fenced prompt body", () => {
  const reply = sentinelReply(
    PROMPT_WITH_FENCES,
    "**CAMBIOS REALIZADOS:**\n- Sección: Precios\n\n**SIN CAMBIOS:**\n- Resto igual.",
  );
  const summary = extractChangeSummary(reply);
  assert.equal(summary, "CAMBIOS REALIZADOS:\n- Sección: Precios");
  assert.doesNotMatch(summary ?? "", /LOS 7 ESTADOS|estado/);
});

test("returns null with no block (a clarifying question)", () => {
  assert.equal(extractPromptFromReply("¿A qué sección te refieres exactamente?"), null);
});

test("hasUnclosedPromptBlock: sentinel opened but not closed (cut off)", () => {
  assert.equal(hasUnclosedPromptBlock(`${PROMPT_START}\nprompt a medias`), true);
});

test("hasUnclosedPromptBlock: false for a complete sentinel block", () => {
  assert.equal(hasUnclosedPromptBlock(sentinelReply("x", "y")), false);
});

// --- Legacy fallback: replies from before the sentinel contract used ``` ---

test("legacy greedy fallback captures an outer ``` block with inner fences", () => {
  const reply = "```\n" + PROMPT_WITH_FENCES + "\n```\n\n**CAMBIOS:** algo";
  assert.equal(extractPromptFromReply(reply), PROMPT_WITH_FENCES);
});

test("legacy hasUnclosedPromptBlock: odd fence count means cut off", () => {
  assert.equal(hasUnclosedPromptBlock("```\ncontenido que se corta"), true);
  assert.equal(hasUnclosedPromptBlock("```\ncontenido\n```"), false);
});

test("extractChangeSummary returns null when there's only a block", () => {
  assert.equal(extractChangeSummary(sentinelReply("solo el prompt", "")), null);
});

test("replacePromptBlock swaps the block content, keeps the summary", () => {
  const reply = sentinelReply("viejo", "**CAMBIOS REALIZADOS:**\n- algo");
  const out = replacePromptBlock(reply, "nuevo v1.8");
  assert.equal(extractPromptFromReply(out), "nuevo v1.8");
  assert.match(out, /CAMBIOS REALIZADOS/);
});

test("replacePromptBlock leaves a reply with no block untouched", () => {
  assert.equal(replacePromptBlock("¿A qué sección?", "x"), "¿A qué sección?");
});

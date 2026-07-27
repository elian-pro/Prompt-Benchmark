/**
 * Unit tests for the selectable-options block helpers (no DB/API required).
 * Run with: node --test --experimental-strip-types lib/prompts/options-block.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitOptionsBlock,
  hasUnclosedOptionsBlock,
  optionsBlockPreamble,
  buildAnswerSummary,
  moveRankItem,
  parseOptionsJson,
  OPTIONS_START,
  OPTIONS_END,
  type OptionsBlock,
} from "./options-block.ts";

function wrap(json: string, before = "", after = ""): string {
  return `${before}${OPTIONS_START}\n${json}\n${OPTIONS_END}${after}`;
}

const SINGLE_JSON = JSON.stringify({
  questions: [
    { id: "budget", prompt: "¿Cuál es tu presupuesto?", type: "single_select", options: ["Bajo", "Medio", "Alto"] },
  ],
});

test("splitOptionsBlock parses a single_select block and keeps surrounding prose", () => {
  const reply = wrap(SINGLE_JSON, "Antes de construir, una duda:\n\n", "\n\n¿Me confirmas?");
  const { before, block, after } = splitOptionsBlock(reply);
  assert.ok(block);
  assert.equal(block.questions.length, 1);
  assert.equal(block.questions[0].type, "single_select");
  assert.deepEqual(block.questions[0].options, ["Bajo", "Medio", "Alto"]);
  assert.match(before, /Antes de construir/);
  assert.match(after, /¿Me confirmas\?/);
});

test("splitOptionsBlock parses multi_select and rank blocks", () => {
  const json = JSON.stringify({
    questions: [
      { id: "zonas", prompt: "¿Qué zonas?", type: "multi_select", options: ["Norte", "Sur", "Centro"] },
      { id: "prio", prompt: "Ordena por prioridad", type: "rank", options: ["Precio", "Ubicación", "Tamaño"] },
    ],
  });
  const { block } = splitOptionsBlock(wrap(json));
  assert.ok(block);
  assert.equal(block.questions[0].type, "multi_select");
  assert.equal(block.questions[1].type, "rank");
});

test("clamps options beyond 4 instead of rejecting the block", () => {
  const json = JSON.stringify({
    questions: [
      { id: "q", prompt: "Elige", type: "single_select", options: ["A", "B", "C", "D", "E", "F"] },
    ],
  });
  const { block } = splitOptionsBlock(wrap(json));
  assert.ok(block);
  assert.deepEqual(block.questions[0].options, ["A", "B", "C", "D"]);
});

test("invalid JSON between markers degrades to block:null (raw text stays)", () => {
  const reply = wrap("{ questions: [ not json ", "Intro\n");
  const { before, block } = splitOptionsBlock(reply);
  assert.equal(block, null);
  // The whole reply falls through to `before` so nothing is lost.
  assert.match(before, /Intro/);
});

test("structurally-broken payload (too few options) fails to null", () => {
  const json = JSON.stringify({
    questions: [{ id: "q", prompt: "Elige", type: "single_select", options: ["Solo una"] }],
  });
  assert.equal(splitOptionsBlock(wrap(json)).block, null);
});

test("unknown question type fails to null", () => {
  const json = JSON.stringify({
    questions: [{ id: "q", prompt: "Elige", type: "dropdown", options: ["A", "B"] }],
  });
  assert.equal(splitOptionsBlock(wrap(json)).block, null);
});

test("hasUnclosedOptionsBlock detects a still-streaming block", () => {
  const streaming = `Una duda:\n${OPTIONS_START}\n{ "questions": [`;
  assert.equal(hasUnclosedOptionsBlock(streaming), true);
  assert.equal(hasUnclosedOptionsBlock(wrap(SINGLE_JSON)), false);
  assert.equal(hasUnclosedOptionsBlock("Solo texto plano"), false);
});

test("optionsBlockPreamble returns only the prose before the opening marker", () => {
  const streaming = `Antes de seguir:\n\n${OPTIONS_START}\n{ "questions": [`;
  assert.equal(optionsBlockPreamble(streaming), "Antes de seguir:\n\n");
  assert.equal(optionsBlockPreamble("sin marcador"), "sin marcador");
});

test("parseOptionsJson tolerates a ```json fence wrapper", () => {
  const raw = '```json\n{ "questions": [] }\n```';
  assert.deepEqual(parseOptionsJson(raw), { questions: [] });
  assert.equal(parseOptionsJson("no hay json aquí"), null);
});

const SUMMARY_BLOCK: OptionsBlock = {
  questions: [
    { id: "budget", prompt: "¿Cuál es tu presupuesto?", type: "single_select", options: ["Bajo", "Medio", "Alto"] },
    { id: "zonas", prompt: "¿Qué zonas?", type: "multi_select", options: ["Norte", "Sur"] },
    { id: "prio", prompt: "Prioridad", type: "rank", options: ["Precio", "Ubicación"] },
  ],
};

test("buildAnswerSummary renders single, multi and rank in one line", () => {
  const summary = buildAnswerSummary(SUMMARY_BLOCK, [
    { questionId: "budget", type: "single_select", value: "Medio" },
    { questionId: "zonas", type: "multi_select", value: ["Norte", "Sur"] },
    { questionId: "prio", type: "rank", value: ["Ubicación", "Precio"] },
  ]);
  assert.equal(
    summary,
    "Cuál es tu presupuesto: Medio · Qué zonas: Norte, Sur · Prioridad: 1) Ubicación, 2) Precio",
  );
});

test("buildAnswerSummary never returns an empty string", () => {
  assert.equal(buildAnswerSummary(SUMMARY_BLOCK, []), "-");
});

test("moveRankItem swaps immutably and respects boundaries", () => {
  const order = ["A", "B", "C"];
  assert.deepEqual(moveRankItem(order, 1, -1), ["B", "A", "C"]);
  assert.deepEqual(moveRankItem(order, 1, 1), ["A", "C", "B"]);
  // Boundaries: no-op, original array returned unchanged.
  assert.deepEqual(moveRankItem(order, 0, -1), ["A", "B", "C"]);
  assert.deepEqual(moveRankItem(order, 2, 1), ["A", "B", "C"]);
  // Original is not mutated.
  assert.deepEqual(order, ["A", "B", "C"]);
});

// Two blocks in one reply (observed drift: the model emits one block per
// question instead of one block with two questions). Both must render.
const PROMOS_JSON = JSON.stringify({
  questions: [
    { id: "promos", prompt: "¿Qué hace el asesor?", type: "single_select", options: ["Remitir", "Call center"] },
  ],
});

const TWO_BLOCK_REPLY =
  wrap(SINGLE_JSON, "Elige el enfoque:\n\n", "\n\nY una duda más sobre promociones:\n\n") +
  wrap(PROMOS_JSON, "", "\n\n¿Te parece?");

test("splitOptionsBlock folds several blocks into one card", () => {
  const { block } = splitOptionsBlock(TWO_BLOCK_REPLY);
  assert.ok(block);
  assert.deepEqual(block.questions.map((q) => q.id), ["budget", "promos"]);
});

test("splitOptionsBlock leaves no raw markers or JSON in the prose", () => {
  const { before, after } = splitOptionsBlock(TWO_BLOCK_REPLY);
  for (const prose of [before, after]) {
    assert.ok(!prose.includes(OPTIONS_START), `stray start marker in: ${prose}`);
    assert.ok(!prose.includes(OPTIONS_END), `stray end marker in: ${prose}`);
    assert.ok(!prose.includes('"questions"'), `stray JSON payload in: ${prose}`);
  }
  // Every intro line reads above the single card (which sits where the last
  // block was), and only the closing prose stays below it.
  assert.match(before, /Elige el enfoque/);
  assert.match(before, /Y una duda más sobre promociones/);
  assert.match(after, /¿Te parece\?/);
  assert.ok(!after.includes("Y una duda"), "intro prose must not fall below the card");
  // Cutting the blocks out must not leave a stack of blank lines behind.
  assert.ok(!/\n{3,}/.test(before), `collapsed blank lines expected in: ${JSON.stringify(before)}`);
});

test("merging drops duplicate question ids and clamps to 3 questions", () => {
  const dup = (id: string) =>
    wrap(JSON.stringify({
      questions: [{ id, prompt: `p-${id}`, type: "single_select", options: ["A", "B"] }],
    }));
  const { block } = splitOptionsBlock([dup("a"), dup("a"), dup("b"), dup("c"), dup("d")].join("\n"));
  assert.ok(block);
  assert.deepEqual(block.questions.map((q) => q.id), ["a", "b", "c"]);
});

test("hasUnclosedOptionsBlock catches a second block still streaming", () => {
  const closed = wrap(SINGLE_JSON, "Elige:\n\n");
  assert.equal(hasUnclosedOptionsBlock(closed), false);
  assert.equal(hasUnclosedOptionsBlock(`${closed}\n\nY otra:\n\n${OPTIONS_START}\n{ "questi`), true);
});

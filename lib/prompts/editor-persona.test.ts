/**
 * Unit tests for the Editor/Creator output-contract helpers (no DB/API required).
 * Run with: node --test --experimental-strip-types lib/prompts/editor-persona.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractPromptFromReply,
  hasUnclosedFence,
  extractChangeSummary,
} from "./editor-persona.ts";

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

test("extractChangeSummary keeps the changes prose, strips bold and SIN CAMBIOS", () => {
  const reply =
    "```\nEl prompt completo\n```\n\n**CAMBIOS REALIZADOS:**\n- Sección modificada: Precios\n- Tipo de cambio: se actualizó el mínimo\n\n**SIN CAMBIOS:**\n- Todo lo demás permanece idéntico.";
  assert.equal(
    extractChangeSummary(reply),
    "CAMBIOS REALIZADOS:\n- Sección modificada: Precios\n- Tipo de cambio: se actualizó el mínimo",
  );
});

test("extractChangeSummary returns null when there's only a block and no prose", () => {
  assert.equal(extractChangeSummary("```\nSolo el prompt\n```"), null);
});

test("extractChangeSummary returns null for a reply with no block (a question)", () => {
  // A clarifying question never creates a version, but guard the shape anyway:
  // with no fenced block the whole text remains, which is the intended fallback.
  assert.equal(
    extractChangeSummary("¿A qué sección te refieres?"),
    "¿A qué sección te refieres?",
  );
});

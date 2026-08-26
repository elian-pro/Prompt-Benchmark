/**
 * Unit tests for the canonical states (no DB/API required).
 * Run with: node --test --experimental-strip-types lib/estados.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ESTADOS, ESTADOS_CONTRACT, isEstadoCanonico } from "./estados.ts";
import { buildEditorSystemPrompt } from "./prompts/editor-persona.ts";
import { buildCreatorSystemPrompt } from "./prompts/creator-persona.ts";

// The point of the whole module: the text the models read must name all seven.
// This is what fails if someone edits the contract and drops one.
test("the contract names every canonical state", () => {
  for (const estado of ESTADOS) {
    assert.ok(ESTADOS_CONTRACT.includes(estado), `falta ${estado} en el contrato`);
  }
});

test("both personas carry the contract", () => {
  assert.ok(buildEditorSystemPrompt().includes(ESTADOS_CONTRACT));
  assert.ok(buildCreatorSystemPrompt("prompt base").includes(ESTADOS_CONTRACT));
});

// A persona override saved in Settings must not drop the contract, same
// guarantee OPTIONS_CONTRACT and ANTI_OVERFIT_CONTRACT already have.
test("a persona override does not drop the contract", () => {
  assert.ok(buildEditorSystemPrompt("otra persona").includes(ESTADOS_CONTRACT));
  assert.ok(buildCreatorSystemPrompt("base", "otra persona").includes(ESTADOS_CONTRACT));
});

test("isEstadoCanonico accepts the seven and rejects a sub-state", () => {
  for (const estado of ESTADOS) assert.ok(isEstadoCanonico(estado));
  assert.equal(isEstadoCanonico("perfilado-vip"), false);
  assert.equal(isEstadoCanonico("activo"), false);
  assert.equal(isEstadoCanonico(null), false);
});

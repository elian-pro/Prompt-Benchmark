import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeadSystemPrompt } from "./adversarial-personas.ts";

test("buildLeadSystemPrompt omits the brief block when none is given", () => {
  const prompt = buildLeadSystemPrompt("evasivo", 2);
  assert.doesNotMatch(prompt, /Tu situación concreta/);
});

test("buildLeadSystemPrompt omits the brief block for blank/whitespace input", () => {
  assert.doesNotMatch(buildLeadSystemPrompt("evasivo", 2, ""), /Tu situación concreta/);
  assert.doesNotMatch(buildLeadSystemPrompt("evasivo", 2, "   "), /Tu situación concreta/);
  assert.doesNotMatch(buildLeadSystemPrompt("evasivo", 2, null), /Tu situación concreta/);
});

test("buildLeadSystemPrompt includes a trimmed brief when given", () => {
  const prompt = buildLeadSystemPrompt(
    "comprador",
    3,
    "  Eres un empresario, tienes un presupuesto de 20mdp y quieres una casa.  ",
  );
  assert.match(prompt, /Tu situación concreta como lead: Eres un empresario, tienes un presupuesto de 20mdp y quieres una casa\./);
  // No leading/trailing whitespace leaked into the prompt from the raw input.
  assert.doesNotMatch(prompt, /lead:   Eres/);
});

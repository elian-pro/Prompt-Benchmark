import { test } from "node:test";
import assert from "node:assert/strict";
import { formatJudgeInput, buildJudgeSystemPrompt } from "./judge.ts";

test("formatJudgeInput labels the prompt and transcript as separate sections", () => {
  const input = formatJudgeInput("Eres un agente de ventas...", "[Turno 1] LEAD: hola");
  assert.match(input, /=== PROMPT DEL AGENTE/);
  assert.match(input, /Eres un agente de ventas.../);
  assert.match(input, /=== CONVERSACIÓN A EVALUAR ===/);
  assert.match(input, /\[Turno 1\] LEAD: hola/);
  // Prompt section must come before the transcript section.
  assert.ok(input.indexOf("PROMPT DEL AGENTE") < input.indexOf("CONVERSACIÓN A EVALUAR"));
});

test("buildJudgeSystemPrompt default mentions using the prompt as reference", () => {
  const prompt = buildJudgeSystemPrompt(null);
  assert.match(prompt, /PROMPT del agente/);
  assert.match(prompt, /No cites el prompt completo/);
});

test("buildJudgeSystemPrompt returns the override verbatim when set", () => {
  const override = "Eres un juez personalizado.";
  assert.equal(buildJudgeSystemPrompt(override), override);
});

/**
 * Unit tests for the Replay handoff message.
 * Run with: node --test --experimental-strip-types lib/prompts/replay-handoff.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReplayHandoff } from "./replay-handoff.ts";
import type { ConversationTurn } from "../conversation-turns.ts";

const TURNS: ConversationTurn[] = [
  { rol: "lead", texto: "Hola, vi su anuncio" },
  { rol: "bot", texto: "¡Qué tal! ¿De qué zona nos escribes?", estado: "activo" },
  { rol: "lead", texto: "De Mérida" },
  { rol: "bot", texto: "Tenemos disponibilidad desde 4.5 MDP", estado: "activo" },
  { rol: "lead", texto: "Ah ok, gracias" },
];

const BASE = {
  clientName: "Chapur",
  versionNumber: "v1.4",
  turns: TURNS,
  failedAt: 3,
  nota: "Dio el precio antes de perfilar.",
};

test("sends the whole conversation, not only the tagged turn", () => {
  const out = buildReplayHandoff(BASE);
  for (const turn of TURNS) assert.ok(out.includes(turn.texto), turn.texto);
});

test("marks the failing turn in place", () => {
  const out = buildReplayHandoff(BASE);
  const lines = out.split("\n");
  const marker = lines.findIndex((l) => l.includes("AQUÍ ESTÁ EL PROBLEMA"));
  assert.ok(marker > 0);
  assert.ok(lines[marker - 1].includes("4.5 MDP"));
});

test("carries the estado of each bot turn", () => {
  // A whole class of bugs is diagnosed by the state, not by the words.
  const out = buildReplayHandoff(BASE);
  assert.ok(out.includes('bot  [activo]: "¡Qué tal! ¿De qué zona nos escribes?"'));
});

test("names the client and the version being judged", () => {
  const out = buildReplayHandoff({ ...BASE, idDeKommo: "65030998" });
  assert.ok(out.includes("Chapur"));
  assert.ok(out.includes("v1.4"));
  assert.ok(out.includes("65030998"));
});

test("says it is production output, not a simulation", () => {
  assert.ok(buildReplayHandoff(BASE).includes("salida real de producción"));
});

test("warns when the conversation predates the version", () => {
  const fresh = buildReplayHandoff(BASE);
  const stale = buildReplayHandoff({ ...BASE, stale: true });
  assert.ok(!fresh.includes("OJO:"));
  assert.ok(stale.includes("OJO:"));
});

test("works with no tagged turn", () => {
  const out = buildReplayHandoff({ ...BASE, failedAt: null });
  assert.ok(!out.includes("AQUÍ ESTÁ EL PROBLEMA"));
  assert.ok(out.includes("Dio el precio antes de perfilar."));
});

test("a state transition renders as its own line", () => {
  const out = buildReplayHandoff({
    ...BASE,
    turns: [{ rol: "bot", texto: "Te paso con un asesor." }, { rol: "sistema", texto: "", estado: "humano" }],
    failedAt: null,
  });
  assert.ok(out.includes("pasa a estado [humano]"));
});

test("an unreadable conversation says so instead of rendering nothing", () => {
  const out = buildReplayHandoff({ ...BASE, turns: [], failedAt: null });
  assert.ok(out.includes("No se pudo leer ningún mensaje"));
});

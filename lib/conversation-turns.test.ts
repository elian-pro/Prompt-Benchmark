/**
 * Unit tests for the conversation transcript parser.
 * Run with: node --test --experimental-strip-types lib/conversation-turns.test.ts
 *
 * The blobs here are real shapes taken from the chats DB, not invented ones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseHistorial, transcriptOf } from "./conversation-turns.ts";

test("splits markers that land mid-line, as the flows write them", () => {
  const historial =
    "User: Buenas tardes\nIA:Qué tal, soy Bad Boy.\nIA:Manejamos Zontes y Aodes. User: Soy de progreso Yucatán\nIA:Va, perfecto.";
  assert.deepEqual(parseHistorial(historial), [
    { rol: "lead", texto: "Buenas tardes" },
    { rol: "bot", texto: "Qué tal, soy Bad Boy." },
    { rol: "bot", texto: "Manejamos Zontes y Aodes." },
    { rol: "lead", texto: "Soy de progreso Yucatán" },
    { rol: "bot", texto: "Va, perfecto." },
  ]);
});

test("drops the empty segment of a User:IA: run", () => {
  const historial = "User:IA: Hola Gustavo, ¿me confirmas tu número? Si Hola \nIA:¡Mucho gusto!";
  assert.deepEqual(parseHistorial(historial), [
    { rol: "bot", texto: "Hola Gustavo, ¿me confirmas tu número? Si Hola" },
    { rol: "bot", texto: "¡Mucho gusto!" },
  ]);
});

test("an estado written as a bot message attaches to the message it describes", () => {
  // Real shape from chats_Sofia. The `|| estado` fallback in one n8n node
  // writes the estado into the bot slot, and the loop node appends the actual
  // messages right after, so the estado arrives BEFORE its own bubbles.
  const historial = "IA:¡Mucho gusto, Gustavo! ¿Cómo estás? User:Muy bien IA:activo\nIA:Cuéntame.";
  assert.deepEqual(parseHistorial(historial), [
    { rol: "bot", texto: "¡Mucho gusto, Gustavo! ¿Cómo estás?" },
    { rol: "lead", texto: "Muy bien" },
    { rol: "bot", texto: "Cuéntame.", estado: "activo" },
  ]);
});

test("a trailing estado describes the last bot message there was", () => {
  const out = parseHistorial("IA:Perfecto. IA:por-perfilar");
  assert.deepEqual(out, [{ rol: "bot", texto: "Perfecto.", estado: "por-perfilar" }]);
});

test("a short bot message is NOT swallowed as an estado", () => {
  // Erring the other way would hide real text from the person debugging.
  const out = parseHistorial("IA:Claro. IA:Perfecto, con gusto");
  assert.deepEqual(out, [
    { rol: "bot", texto: "Claro." },
    { rol: "bot", texto: "Perfecto, con gusto" },
  ]);
});

test("a state transition becomes a sistema turn", () => {
  const out = parseHistorial("IA:Te paso con un asesor.\nse mueve a humano");
  assert.deepEqual(out, [
    { rol: "bot", texto: "Te paso con un asesor." },
    { rol: "sistema", texto: "", estado: "humano" },
  ]);
});

test("an empty or marker-less historial yields no turns", () => {
  assert.deepEqual(parseHistorial(""), []);
  assert.deepEqual(parseHistorial("texto suelto sin marcadores"), []);
});

test("transcriptOf prefers turnos and reports the source", () => {
  const row = {
    turnos: [
      { rol: "lead", texto: "Ya en desarrollo" },
      { rol: "bot", texto: "¿En qué rango?", estado: "por-perfilar" },
    ],
    historial: "User:otra cosa",
  };
  assert.deepEqual(transcriptOf(row), { turns: row.turnos, source: "turnos" });
});

test("transcriptOf falls back to the parser when turnos is null", () => {
  const out = transcriptOf({ turnos: null, historial: "User: Hola" });
  assert.equal(out.source, "historial");
  assert.deepEqual(out.turns, [{ rol: "lead", texto: "Hola" }]);
});

test("transcriptOf drops entries that are not turns", () => {
  const out = transcriptOf({ turnos: [{ rol: "lead", texto: "Hola" }, "basura", null] });
  assert.equal(out.turns.length, 1);
});

test("an empty turnos array counts as exact, not as a parse failure", () => {
  assert.deepEqual(transcriptOf({ turnos: [], historial: "User: Hola" }), {
    turns: [],
    source: "turnos",
  });
});

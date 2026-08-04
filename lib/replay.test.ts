/**
 * Unit tests for the replay reconstruction.
 * Run with: node --test --experimental-strip-types lib/replay.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReplayPlan, isReplayable } from "./replay.ts";
import type { ConversationTurn } from "./conversation-turns.ts";

const TURNS: ConversationTurn[] = [
  { rol: "lead", texto: "Hola, vi su anuncio" },
  { rol: "bot", texto: "¡Qué tal!", estado: "activo" },
  { rol: "bot", texto: "¿De qué zona nos escribes?", estado: "activo" },
  { rol: "lead", texto: "De Mérida" },
  { rol: "bot", texto: "Perfecto.", estado: "activo" },
  { rol: "bot", texto: "Tenemos desde 4.5 MDP", estado: "activo" },
  { rol: "lead", texto: "Ah ok, gracias" },
];

test("the bot's turns go back as the envelope it emitted", () => {
  const { messages } = buildReplayPlan(TURNS, 5);
  assert.deepEqual(messages, [
    { role: "user", content: "Hola, vi su anuncio" },
    {
      role: "assistant",
      content: '{"estado":"activo","mensajes":["¡Qué tal!","¿De qué zona nos escribes?"]}',
    },
    { role: "user", content: "De Mérida" },
  ]);
});

test("one reply is one envelope, however many bubbles it was stored as", () => {
  const { messages } = buildReplayPlan(TURNS, 5);
  const assistants = messages.filter((m) => m.role === "assistant");
  assert.equal(assistants.length, 1);
});

test("tagging any bubble of a reply cuts before the whole reply", () => {
  // Bubble 4 and bubble 5 are the same answer: both must be regenerated.
  const fromFirst = buildReplayPlan(TURNS, 4);
  const fromSecond = buildReplayPlan(TURNS, 5);
  assert.deepEqual(fromFirst.messages, fromSecond.messages);
  assert.deepEqual(
    fromSecond.original.map((t) => t.texto),
    ["Perfecto.", "Tenemos desde 4.5 MDP"],
  );
});

test("tagging a lead message means its answer was wrong", () => {
  const { messages, original } = buildReplayPlan(TURNS, 3);
  assert.equal(messages.at(-1)?.content, "De Mérida");
  assert.deepEqual(original.map((t) => t.texto), ["Perfecto.", "Tenemos desde 4.5 MDP"]);
});

test("a state transition is not a message and never reaches the model", () => {
  const turns: ConversationTurn[] = [
    { rol: "lead", texto: "Quiero hablar con alguien" },
    { rol: "sistema", texto: "", estado: "humano" },
    { rol: "bot", texto: "Te paso con un asesor." },
  ];
  const { messages } = buildReplayPlan(turns, 2);
  assert.deepEqual(messages, [{ role: "user", content: "Quiero hablar con alguien" }]);
});

test("an envelope with no estado omits the key rather than sending null", () => {
  const turns: ConversationTurn[] = [
    { rol: "lead", texto: "Hola" },
    { rol: "bot", texto: "¡Hola!" },
    { rol: "lead", texto: "¿Precio?" },
    { rol: "bot", texto: "Desde 4.5 MDP" },
  ];
  const { messages } = buildReplayPlan(turns, 3);
  assert.equal(messages[1].content, '{"mensajes":["¡Hola!"]}');
});

test("a replay needs a lead message to answer", () => {
  assert.equal(isReplayable(buildReplayPlan(TURNS, 5)), true);
  // Tagging the opening message: nothing precedes it, so there is nothing to
  // react to and no replay to run.
  const opening: ConversationTurn[] = [
    { rol: "bot", texto: "Hola, ¿me confirmas tu número?" },
    { rol: "lead", texto: "Sí" },
  ];
  assert.equal(isReplayable(buildReplayPlan(opening, 0)), false);
});

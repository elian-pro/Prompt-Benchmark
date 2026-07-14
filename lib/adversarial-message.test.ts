/**
 * Unit tests for parseTurnBubbles (WhatsApp-style bubble splitting).
 * Run with: node --test --experimental-strip-types lib/adversarial-message.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTurnBubbles } from "./adversarial-message.ts";

test("splits a JSON mensajes array into one bubble per item, estado on the side", () => {
  const content = JSON.stringify({
    estado: "por-perfilar",
    mensajes: ["Qué gusto, te leo con atención.", "Cuéntame, qué tipo de propiedad buscas?"],
  });
  assert.deepEqual(parseTurnBubbles(content), {
    messages: ["Qué gusto, te leo con atención.", "Cuéntame, qué tipo de propiedad buscas?"],
    state: "por-perfilar",
  });
});

test("splits a single message string on line breaks", () => {
  const content = JSON.stringify({ estado: "activo", mensajes: "Hola\nBienvenido\nSoy Coco" });
  assert.deepEqual(parseTurnBubbles(content), {
    messages: ["Hola", "Bienvenido", "Soy Coco"],
    state: "activo",
  });
});

test("collapses blank lines between bubbles", () => {
  const content = JSON.stringify({ mensajes: "Primero.\n\n\nSegundo." });
  assert.deepEqual(parseTurnBubbles(content).messages, ["Primero.", "Segundo."]);
});

test("plain (non-JSON) text splits by line break with no state", () => {
  assert.deepEqual(parseTurnBubbles("Uno\nDos"), { messages: ["Uno", "Dos"], state: null });
});

test("a turn with only an estado yields no bubbles", () => {
  const content = JSON.stringify({ estado: "humano", mensajes: "" });
  assert.deepEqual(parseTurnBubbles(content), { messages: [], state: "humano" });
});

test("a single-line message is one bubble", () => {
  assert.deepEqual(parseTurnBubbles("Hola").messages, ["Hola"]);
});

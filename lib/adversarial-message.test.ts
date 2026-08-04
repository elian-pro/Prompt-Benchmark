/**
 * Unit tests for parseTurnBubbles (WhatsApp-style bubble splitting).
 * Run with: node --test --experimental-strip-types lib/adversarial-message.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { asEnvelope, messagePreview, parseTurnBubbles } from "./adversarial-message.ts";

const ENVELOPE_PROMPT = 'Responde con {"estado": "activo", "mensajes": ["..."]}';

test("wraps a plain-text opening message in the envelope the prompt asks for", () => {
  assert.equal(asEnvelope("Hola Shel, ¿confirmas?", ENVELOPE_PROMPT), '{"mensajes":["Hola Shel, ¿confirmas?"]}');
  // Already an envelope, or a prompt that never asks for one: untouched.
  assert.equal(asEnvelope('{"estado":"activo","mensajes":["Hola"]}', ENVELOPE_PROMPT), '{"estado":"activo","mensajes":["Hola"]}');
  assert.equal(asEnvelope("Hola", "Responde en texto plano."), "Hola");
});

test("splits a JSON mensajes array into one bubble per item, estado on the side", () => {
  const content = JSON.stringify({
    estado: "por-perfilar",
    mensajes: ["Qué gusto, te leo con atención.", "Cuéntame, qué tipo de propiedad buscas?"],
  });
  assert.deepEqual(parseTurnBubbles(content), {
    messages: ["Qué gusto, te leo con atención.", "Cuéntame, qué tipo de propiedad buscas?"],
    state: "por-perfilar",
    malformed: false,
  });
});

test("splits a single message string on line breaks", () => {
  const content = JSON.stringify({ estado: "activo", mensajes: "Hola\nBienvenido\nSoy Coco" });
  assert.deepEqual(parseTurnBubbles(content), {
    messages: ["Hola", "Bienvenido", "Soy Coco"],
    state: "activo",
    malformed: false,
  });
});

test("collapses blank lines between bubbles", () => {
  const content = JSON.stringify({ mensajes: "Primero.\n\n\nSegundo." });
  assert.deepEqual(parseTurnBubbles(content).messages, ["Primero.", "Segundo."]);
});

test("plain (non-JSON) text splits by line break with no state", () => {
  assert.deepEqual(parseTurnBubbles("Uno\nDos"), {
    messages: ["Uno", "Dos"],
    state: null,
    malformed: false,
  });
});

test("a turn with only an estado yields no bubbles", () => {
  const content = JSON.stringify({ estado: "humano", mensajes: "" });
  assert.deepEqual(parseTurnBubbles(content), { messages: [], state: "humano", malformed: false });
});

test("a single-line message is one bubble", () => {
  assert.deepEqual(parseTurnBubbles("Hola").messages, ["Hola"]);
});

test("unwraps a ```json code fence and splits the envelope correctly", () => {
  // The exact shape a model produced in production: valid JSON, but fenced.
  const content =
    '```json\n{\n"estado": "por-perfilar",\n"mensajes": [\n"¡Mucho gusto, Carlos!",\n"¿Qué te llamó la atención?"\n]\n}\n```';
  assert.deepEqual(parseTurnBubbles(content), {
    messages: ["¡Mucho gusto, Carlos!", "¿Qué te llamó la atención?"],
    state: "por-perfilar",
    malformed: false,
  });
});

test("does NOT explode a raw JSON blob into per-line bubbles when unparseable", () => {
  // Broken JSON (trailing comma, unquoted) that looks like an envelope.
  const content = '{\n"estado": "x",\n"mensajes": [\n"hola",\n]\n oops }';
  const out = parseTurnBubbles(content);
  assert.equal(out.malformed, true);
  assert.deepEqual(out.messages, []);
});

test("valid JSON is unaffected by fence stripping", () => {
  const content = JSON.stringify({ estado: "activo", mensajes: ["Hola"] });
  assert.deepEqual(parseTurnBubbles(content), {
    messages: ["Hola"],
    state: "activo",
    malformed: false,
  });
});

test("messagePreview quotes what the lead read, not the envelope", () => {
  const envelope = JSON.stringify({ estado: "perfilado", mensajes: ["Abrimos a las 8."] });
  assert.equal(messagePreview(envelope), "Abrimos a las 8.");
});

test("messagePreview truncates long messages", () => {
  const long = "a".repeat(80);
  const out = messagePreview(long);
  assert.equal(out.length, 61); // 60 chars + the ellipsis
  assert.ok(out.endsWith("…"));
});

test("messagePreview leaves a short plain message alone", () => {
  assert.equal(messagePreview("Hola"), "Hola");
});

test("messagePreview names an empty message instead of rendering nothing", () => {
  const envelope = JSON.stringify({ estado: "humano", mensajes: [] });
  assert.equal(messagePreview(envelope), "(sin mensaje)");
});

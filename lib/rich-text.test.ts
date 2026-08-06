/**
 * Run with: node --test --experimental-strip-types lib/rich-text.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRichText } from "./rich-text.ts";

test("plain text is one token", () => {
  assert.deepEqual(parseRichText("hola"), [{ text: "hola" }]);
});

// The whole reason this exists: a model writes markdown, a lead reads WhatsApp.
test("both bold syntaxes, and the two-character one wins", () => {
  assert.deepEqual(parseRichText("**Qué debió responder:** ya"), [
    { text: "Qué debió responder:", bold: true },
    { text: " ya" },
  ]);
  assert.deepEqual(parseRichText("es *urgente* hoy"), [
    { text: "es " },
    { text: "urgente", bold: true },
    { text: " hoy" },
  ]);
});

test("italic, strike and mono", () => {
  assert.deepEqual(parseRichText("_así_"), [{ text: "así", italic: true }]);
  assert.deepEqual(parseRichText("~no~"), [{ text: "no", strike: true }]);
  assert.deepEqual(parseRichText("~~tampoco~~"), [{ text: "tampoco", strike: true }]);
  assert.deepEqual(parseRichText("`5000`"), [{ text: "5000", mono: true }]);
});

// An unmatched marker is text: a price like "2*3" or a lone asterisk must not
// swallow the rest of the message.
test("an unclosed marker stays literal", () => {
  assert.deepEqual(parseRichText("el mínimo es 5,000 * pieza"), [
    { text: "el mínimo es 5,000 * pieza" },
  ]);
});

test("markers do not cross a line break", () => {
  assert.deepEqual(parseRichText("*hola\nadiós*"), [{ text: "*hola\nadiós*" }]);
});

/**
 * Run with: node --test --experimental-strip-types lib/google-chat/message.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildNoteMessage } from "./message.ts";

const base = {
  clientName: "Vero Lozano",
  roundLabel: "Primera ronda, agosto",
  expected: "Decirle el precio del departamento de dos recámaras.",
  complaint: "Se fue por las ramas.",
  url: "https://studio.zebra.mx/lab/demo/abc",
};

test("carries who, which round, the fix and the way in", () => {
  const msg = buildNoteMessage(base);
  assert.match(msg, /Vero Lozano/);
  assert.match(msg, /Primera ronda, agosto/);
  assert.match(msg, /precio del departamento/);
  assert.match(msg, /Se fue por las ramas/);
  assert.match(msg, /<https:\/\/studio\.zebra\.mx\/lab\/demo\/abc\|Ver la conversación>/);
});

// The complaint is optional for the client. A heading with nothing under it
// reads like the message got cut off.
test("no complaint, no heading for it", () => {
  const msg = buildNoteMessage({ ...base, complaint: null });
  assert.doesNotMatch(msg, /Qué estuvo mal/);
  assert.match(msg, /Debió responder/);
});

test("a missing name or label still reads as a sentence", () => {
  const msg = buildNoteMessage({ ...base, clientName: null, roundLabel: null, url: null });
  assert.match(msg, /\*Nuevo reporte · Cliente\*/);
  assert.doesNotMatch(msg, /Ronda:/);
  assert.doesNotMatch(msg, /undefined|null/);
});

// A client can write a wall of text with line breaks; the message has to stay
// scannable in a notification.
test("long text is flattened and cut", () => {
  const msg = buildNoteMessage({ ...base, expected: `a\nb\n${"x".repeat(400)}` });
  const line = msg.split("\n").find((l) => l.startsWith("*Debió responder:*"))!;
  assert.ok(line.length < 340, line.length.toString());
  assert.match(line, /…$/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextPasteName,
  clampThreshold,
  SMART_PASTE_THRESHOLD_MIN,
  SMART_PASTE_THRESHOLD_MAX,
} from "./smart-paste.ts";

test("nextPasteName starts at 1 with no prior pastes", () => {
  assert.equal(nextPasteName([]), "Texto pegado 1.txt");
  assert.equal(nextPasteName(["prompt.pdf", "notas.md"]), "Texto pegado 1.txt");
});

test("nextPasteName increments past the highest existing number", () => {
  assert.equal(nextPasteName(["Texto pegado 1.txt"]), "Texto pegado 2.txt");
  assert.equal(
    nextPasteName(["Texto pegado 1.txt", "Texto pegado 2.txt", "Texto pegado 3.txt"]),
    "Texto pegado 4.txt",
  );
});

test("nextPasteName never reuses a number, even after removal", () => {
  // Simulates: pasted 1, 2, 3 got removed, only 2 remains in the pending list,
  // but 1 and 3 are still referenced by already-sent messages.
  assert.equal(
    nextPasteName(["Texto pegado 1.txt", "Texto pegado 3.txt", "Texto pegado 2.txt"]),
    "Texto pegado 4.txt",
  );
});

test("nextPasteName ignores unrelated or malformed filenames", () => {
  assert.equal(nextPasteName(["Texto pegado abc.txt", "texto pegado 1.txt"]), "Texto pegado 1.txt");
});

test("clampThreshold leaves in-range values untouched", () => {
  assert.equal(clampThreshold(1000), 1000);
  assert.equal(clampThreshold(SMART_PASTE_THRESHOLD_MIN), SMART_PASTE_THRESHOLD_MIN);
  assert.equal(clampThreshold(SMART_PASTE_THRESHOLD_MAX), SMART_PASTE_THRESHOLD_MAX);
});

test("clampThreshold clamps out-of-range values to the nearest limit", () => {
  assert.equal(clampThreshold(50), SMART_PASTE_THRESHOLD_MIN);
  assert.equal(clampThreshold(0), SMART_PASTE_THRESHOLD_MIN);
  assert.equal(clampThreshold(-100), SMART_PASTE_THRESHOLD_MIN);
  assert.equal(clampThreshold(50000), SMART_PASTE_THRESHOLD_MAX);
});

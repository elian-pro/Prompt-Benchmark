/**
 * Run with: node --test --experimental-strip-types lib/demo-visit.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gateStateFor, VISIT_MS } from "./demo-visit.ts";

const NOW = 1_800_000_000_000;

test("never opened: the walkthrough, one step at a time", () => {
  assert.deepEqual(gateStateFor(null, NOW), { started: false, stepped: true });
});

test("active minutes ago: straight into the chat", () => {
  assert.deepEqual(gateStateFor(String(NOW - 60_000), NOW), { started: true, stepped: false });
});

test("back after the window: the whole card, no steps", () => {
  assert.deepEqual(gateStateFor(String(NOW - VISIT_MS - 1), NOW), {
    started: false,
    stepped: false,
  });
});

// What older versions wrote. It must not read as a first visit, or someone who
// already tested gets walked through the steps again.
test("the legacy \"1\" counts as read, long ago", () => {
  assert.deepEqual(gateStateFor("1", NOW), { started: false, stepped: false });
});

test("garbage in storage is treated as never opened", () => {
  assert.deepEqual(gateStateFor("qué", NOW), { started: false, stepped: true });
});

/**
 * Unit tests for version-number helpers (no DB required).
 * Run with: node --test --experimental-strip-types lib/version-utils.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeNextNumber, parseVersion } from "./version-utils.ts";

test("parseVersion reads major/minor", () => {
  assert.deepEqual(parseVersion("v3.7"), { major: 3, minor: 7 });
});

test("parseVersion falls back on malformed input", () => {
  assert.deepEqual(parseVersion("nope"), { major: 1, minor: 0 });
});

test("minor bump increments the minor part", () => {
  assert.equal(computeNextNumber("v3.0", "minor"), "v3.1");
  assert.equal(computeNextNumber("v2.5", "minor"), "v2.6");
});

test("minor bump rolls over to the next integer at .9", () => {
  assert.equal(computeNextNumber("v2.9", "minor"), "v3.0");
  assert.equal(computeNextNumber("v1.9", "minor"), "v2.0");
});

test("major bump increments major and resets minor", () => {
  assert.equal(computeNextNumber("v2.5", "major"), "v3.0");
  assert.equal(computeNextNumber("v1.9", "major"), "v2.0");
});

test("imported uses the override verbatim", () => {
  assert.equal(computeNextNumber("v1.0", "imported", "v2.5"), "v2.5");
});

test("imported without an override throws", () => {
  assert.throws(() => computeNextNumber("v1.0", "imported"));
});

test("null/malformed latest falls back to a v1.0 baseline", () => {
  assert.equal(computeNextNumber(null, "minor"), "v1.1");
  assert.equal(computeNextNumber(null, "major"), "v2.0");
  assert.equal(computeNextNumber("garbage", "minor"), "v1.1");
});

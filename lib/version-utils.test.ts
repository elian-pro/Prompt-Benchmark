/**
 * Unit tests for version-number helpers (no DB required).
 * Run with: node --test --experimental-strip-types lib/version-utils.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeNextNumber, parseVersion, syncVersionMarkers } from "./version-utils.ts";

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

test("syncVersionMarkers updates the title token, drops the old line, adds a footer", () => {
  const content =
    "# PROMPT CONVERSACIONAL - COCO IA v1.4\nVersión: 1.4\n\nCuerpo del prompt.";
  assert.equal(
    syncVersionMarkers(content, "v1.5"),
    "# PROMPT CONVERSACIONAL - COCO IA v1.5\n\nCuerpo del prompt.\n\n# FIN DEL PROMPT CONVERSACIONAL - COCO IA v1.5",
  );
});

test("syncVersionMarkers appends a version token to a title that lacks one", () => {
  const content = "# PROMPT ASISTENTE\n\nObjetivo principal...";
  assert.equal(
    syncVersionMarkers(content, "v1.0"),
    "# PROMPT ASISTENTE v1.0\n\nObjetivo principal...\n\n# FIN DEL PROMPT ASISTENTE v1.0",
  );
});

test("syncVersionMarkers regenerates an existing footer instead of duplicating it", () => {
  const content =
    "# PROMPT X v1.4\n\nCuerpo.\n\n# FIN DEL PROMPT X v1.4";
  assert.equal(
    syncVersionMarkers(content, "v2.0"),
    "# PROMPT X v2.0\n\nCuerpo.\n\n# FIN DEL PROMPT X v2.0",
  );
});

test("syncVersionMarkers is idempotent", () => {
  const once = syncVersionMarkers("# PROMPT X v1.4\nVersión: 1.4\n\nCuerpo.", "v1.5");
  assert.equal(syncVersionMarkers(once, "v1.5"), once);
});

test("syncVersionMarkers leaves inner subheadings alone, only the first heading is the title", () => {
  const content = "# TITULO v1.0\n\n## Sección\n\nTexto.";
  assert.equal(
    syncVersionMarkers(content, "v1.1"),
    "# TITULO v1.1\n\n## Sección\n\nTexto.\n\n# FIN DEL TITULO v1.1",
  );
});

test("syncVersionMarkers falls back to a bare token when there is no heading", () => {
  assert.equal(syncVersionMarkers("Objetivo principal...", "v1.0"), "v1.0\n\nObjetivo principal...");
});

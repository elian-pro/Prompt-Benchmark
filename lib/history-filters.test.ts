/**
 * Unit tests for the conversation-history search helpers.
 * Run with: node --test --experimental-strip-types lib/history-filters.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { isDateOnly, nextDay, searchFilterFor } from "./history-filters.ts";

test("a Kommo id is classified as numeric and keeps the id column", () => {
  assert.deepEqual(searchFilterFor("65030998"), {
    kind: "numeric",
    value: "65030998",
    includeId: true,
  });
});

test("a run of digits too long for a bigint drops the id column", () => {
  // Casting it to bigint would overflow and error the whole query rather than
  // simply not matching, so the caller leaves `id` out of the OR.
  assert.deepEqual(searchFilterFor("1".repeat(25)), {
    kind: "numeric",
    value: "1".repeat(25),
    includeId: false,
  });
});

test("free text is carried as a value, never as SQL", () => {
  // Commas, parens and quotes are ordinary characters here because the caller
  // binds this as a parameter. That is the whole reason the shape is neutral.
  assert.deepEqual(searchFilterFor("Gustavo López, arquitecto"), {
    kind: "text",
    value: "Gustavo López, arquitecto",
  });
  assert.deepEqual(searchFilterFor("(sin interés)"), {
    kind: "text",
    value: "(sin interés)",
  });
  assert.deepEqual(searchFilterFor("O'Brien"), { kind: "text", value: "O'Brien" });
});

test("blank and whitespace-only searches filter nothing", () => {
  assert.equal(searchFilterFor(""), null);
  assert.equal(searchFilterFor("   "), null);
});

test("a search is trimmed before being classified", () => {
  assert.deepEqual(searchFilterFor("  65030998  "), {
    kind: "numeric",
    value: "65030998",
    includeId: true,
  });
});

test("isDateOnly separates a date input from a timestamp", () => {
  assert.equal(isDateOnly("2026-07-30"), true);
  assert.equal(isDateOnly("2026-07-30T13:40:23Z"), false);
  assert.equal(isDateOnly(""), false);
});

test("nextDay rolls over months and years", () => {
  assert.equal(nextDay("2026-07-30"), "2026-07-31");
  assert.equal(nextDay("2026-07-31"), "2026-08-01");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
  assert.equal(nextDay("2028-02-28"), "2028-02-29");
});

/**
 * Unit tests for the conversation-history search helpers.
 * Run with: node --test --experimental-strip-types lib/history-filters.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { isDateOnly, nextDay, searchFilterFor } from "./history-filters.ts";

test("a Kommo id matches both id columns and the transcript", () => {
  assert.deepEqual(searchFilterFor("65030998"), {
    kind: "or",
    filter: "id.eq.65030998,id_de_kommo.eq.65030998,historial.ilike.*65030998*",
  });
});

test("a run of digits too long for a bigint drops the id column", () => {
  // Keeping id.eq here would overflow and error the whole query rather than
  // simply not matching.
  const out = searchFilterFor("1".repeat(25));
  assert.equal(out?.kind, "or");
  assert.ok(!(out as { filter: string }).filter.includes("id.eq."));
  assert.ok((out as { filter: string }).filter.includes("id_de_kommo.eq."));
});

test("free text never reaches the or filter, where a comma would break it", () => {
  assert.deepEqual(searchFilterFor("Gustavo López, arquitecto"), {
    kind: "ilike",
    column: "historial",
    pattern: "%Gustavo López, arquitecto%",
  });
  assert.deepEqual(searchFilterFor("(sin interés)"), {
    kind: "ilike",
    column: "historial",
    pattern: "%(sin interés)%",
  });
});

test("blank and whitespace-only searches filter nothing", () => {
  assert.equal(searchFilterFor(""), null);
  assert.equal(searchFilterFor("   "), null);
});

test("a search is trimmed before being classified", () => {
  assert.equal(searchFilterFor("  65030998  ")?.kind, "or");
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

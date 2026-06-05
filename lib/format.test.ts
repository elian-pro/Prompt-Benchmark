import { test } from "node:test";
import assert from "node:assert/strict";

import { daysBetween, relativeTimeEs } from "./format.ts";

const NOW = Date.parse("2026-06-05T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

test("daysBetween counts whole days", () => {
  assert.equal(daysBetween(ago(3), NOW), 3);
  assert.equal(daysBetween(ago(0), NOW), 0);
});

test("relativeTimeEs days", () => {
  assert.equal(relativeTimeEs(ago(0), NOW), "HOY");
  assert.equal(relativeTimeEs(ago(1), NOW), "HACE 1 DÍA");
  assert.equal(relativeTimeEs(ago(4), NOW), "HACE 4 DÍAS");
});

test("relativeTimeEs weeks and months", () => {
  assert.equal(relativeTimeEs(ago(7), NOW), "HACE 1 SEMANA");
  assert.equal(relativeTimeEs(ago(21), NOW), "HACE 3 SEMANAS");
  assert.equal(relativeTimeEs(ago(45), NOW), "HACE 1 MES");
});

test("relativeTimeEs years", () => {
  assert.equal(relativeTimeEs(ago(400), NOW), "HACE 1 AÑO");
});

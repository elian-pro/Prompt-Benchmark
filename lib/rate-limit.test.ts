import { test } from "node:test";
import assert from "node:assert/strict";

import { createRateLimiter, DEMO_MESSAGE_RULE } from "./rate-limit.ts";

const RULE = { minGapMs: 1_000, maxPerWindow: 3, windowMs: 10_000 };

test("allows the first hit", () => {
  const limiter = createRateLimiter(RULE);
  assert.deepEqual(limiter.check("a", 0), { ok: true, retryAfterMs: 0 });
});

test("rejects a second hit inside the minimum gap, and says how long to wait", () => {
  const limiter = createRateLimiter(RULE);
  limiter.check("a", 0);
  assert.deepEqual(limiter.check("a", 400), { ok: false, retryAfterMs: 600 });
});

test("allows again once the gap has passed", () => {
  const limiter = createRateLimiter(RULE);
  limiter.check("a", 0);
  assert.equal(limiter.check("a", 1_000).ok, true);
});

test("a rejected hit does not extend the window", () => {
  const limiter = createRateLimiter(RULE);
  limiter.check("a", 0);
  // Hammering during the gap must not push the next allowed moment out.
  for (const t of [100, 200, 300, 900]) limiter.check("a", t);
  assert.equal(limiter.check("a", 1_000).ok, true);
});

test("rejects past the window quota", () => {
  const limiter = createRateLimiter(RULE);
  limiter.check("a", 0);
  limiter.check("a", 2_000);
  limiter.check("a", 4_000);
  const verdict = limiter.check("a", 6_000);
  assert.equal(verdict.ok, false);
  // The oldest hit was at 0, so the quota frees up 10s later.
  assert.equal(verdict.retryAfterMs, 4_000);
});

test("the window slides: old hits stop counting", () => {
  const limiter = createRateLimiter(RULE);
  limiter.check("a", 0);
  limiter.check("a", 2_000);
  limiter.check("a", 4_000);
  assert.equal(limiter.check("a", 11_000).ok, true);
});

test("keys are independent", () => {
  const limiter = createRateLimiter(RULE);
  limiter.check("a", 0);
  assert.equal(limiter.check("b", 0).ok, true);
});

test("the shipped rule spaces messages by 3 seconds", () => {
  const limiter = createRateLimiter(DEMO_MESSAGE_RULE);
  limiter.check("ip", 0);
  assert.equal(limiter.check("ip", 2_999).ok, false);
  assert.equal(limiter.check("ip", 3_000).ok, true);
});

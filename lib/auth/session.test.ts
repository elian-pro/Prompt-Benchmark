import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-16-chars-long-xxxx";
process.env.AUTH_ALLOWED_DOMAIN = "zebradigital.marketing";

const {
  createSessionToken,
  verifySessionToken,
  isEmailAllowed,
  SESSION_TTL_SECONDS,
} = await import("./session.ts");

const NOW = 1_700_000_000_000; // fixed instant so tests are deterministic

test("isEmailAllowed accepts the company domain", () => {
  assert.equal(isEmailAllowed("ana@zebradigital.marketing"), true);
  assert.equal(isEmailAllowed("ANA@Zebradigital.Marketing"), true);
  assert.equal(isEmailAllowed("  ana@zebradigital.marketing  "), true);
});

test("isEmailAllowed rejects other domains and lookalikes", () => {
  assert.equal(isEmailAllowed("ana@gmail.com"), false);
  assert.equal(isEmailAllowed("ana@evilzebradigital.marketing"), false);
  assert.equal(isEmailAllowed("ana@zebradigital.marketing.evil.com"), false);
  assert.equal(isEmailAllowed("anazebradigital.marketing"), false);
  assert.equal(isEmailAllowed("a@b@zebradigital.marketing"), false);
  assert.equal(isEmailAllowed(""), false);
  assert.equal(isEmailAllowed(null), false);
  assert.equal(isEmailAllowed(undefined), false);
});

test("round-trips a valid token", async () => {
  const token = await createSessionToken("ana@zebradigital.marketing", NOW);
  const payload = await verifySessionToken(token, NOW);
  assert.ok(payload);
  assert.equal(payload.email, "ana@zebradigital.marketing");
  assert.equal(payload.exp, Math.floor(NOW / 1000) + SESSION_TTL_SECONDS);
});

test("normalizes email casing into the token", async () => {
  const token = await createSessionToken("ANA@Zebradigital.Marketing", NOW);
  const payload = await verifySessionToken(token, NOW);
  assert.equal(payload?.email, "ana@zebradigital.marketing");
});

test("rejects an expired token", async () => {
  const token = await createSessionToken("ana@zebradigital.marketing", NOW);
  const later = NOW + (SESSION_TTL_SECONDS + 1) * 1000;
  assert.equal(await verifySessionToken(token, later), null);
});

test("rejects a tampered payload", async () => {
  const token = await createSessionToken("ana@zebradigital.marketing", NOW);
  const [, sig] = token.split(".");
  // Forge a payload for a different email but keep the old signature.
  const forgedPayload = Buffer.from(
    JSON.stringify({ email: "hacker@evil.com", exp: Math.floor(NOW / 1000) + 999 }),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(await verifySessionToken(`${forgedPayload}.${sig}`, NOW), null);
});

test("rejects a token signed with a different secret", async () => {
  const token = await createSessionToken("ana@zebradigital.marketing", NOW);
  const original = process.env.AUTH_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = "a-totally-different-secret-value-yyyy";
  const result = await verifySessionToken(token, NOW);
  process.env.AUTH_SESSION_SECRET = original;
  assert.equal(result, null);
});

test("rejects a token whose email is no longer in the domain", async () => {
  // A validly signed token whose email domain is not allowed must fail even
  // with a good signature (defense in depth if the allow-list changes).
  const original = process.env.AUTH_ALLOWED_DOMAIN;
  process.env.AUTH_ALLOWED_DOMAIN = "otradomain.com";
  const token = await createSessionToken("ana@otradomain.com", NOW);
  process.env.AUTH_ALLOWED_DOMAIN = original;
  assert.equal(await verifySessionToken(token, NOW), null);
});

test("rejects malformed tokens without throwing", async () => {
  assert.equal(await verifySessionToken(null, NOW), null);
  assert.equal(await verifySessionToken("", NOW), null);
  assert.equal(await verifySessionToken("no-dot", NOW), null);
  assert.equal(await verifySessionToken(".onlysig", NOW), null);
  assert.equal(await verifySessionToken("onlypayload.", NOW), null);
  assert.equal(await verifySessionToken("not.base64!!", NOW), null);
});

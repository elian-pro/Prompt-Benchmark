/**
 * Roundtrip tests for lib/crypto.ts.
 * Run with: node --test (after compiling) or `node --import tsx --test`.
 * Uses Node's built-in test runner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.KEY_ENCRYPTION_SECRET ??= "test-secret-for-crypto-roundtrip-only";

import { encrypt, decrypt } from "./crypto.ts";

test("roundtrip returns the original plaintext", () => {
  const plaintext = "sk-ant-api03-abc123-secret-key";
  const ciphertext = encrypt(plaintext);
  assert.equal(decrypt(ciphertext), plaintext);
});

test("ciphertext has the iv:data:tag shape", () => {
  const ciphertext = encrypt("hello");
  assert.equal(ciphertext.split(":").length, 3);
});

test("two encryptions of the same plaintext differ (random IV)", () => {
  const a = encrypt("same-input");
  const b = encrypt("same-input");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test("tampered ciphertext fails authentication", () => {
  const ciphertext = encrypt("integrity-check");
  const [iv, data, tag] = ciphertext.split(":");
  // Flip a byte in the data segment.
  const tampered = Buffer.from(data, "base64");
  tampered[0] ^= 0xff;
  const broken = [iv, tampered.toString("base64"), tag].join(":");
  assert.throws(() => decrypt(broken));
});

test("empty string roundtrips", () => {
  assert.equal(decrypt(encrypt("")), "");
});

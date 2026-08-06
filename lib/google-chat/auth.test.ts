/**
 * Run with: node --test --experimental-strip-types lib/google-chat/auth.test.ts
 *
 * No network: a key pair is generated here, the JWT is signed with the same
 * code the app uses, and the signature is verified against the public half.
 * If this passes, what reaches Google is a token Google can check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";

import { buildClaims, CHAT_SCOPE, signJwt } from "./auth.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

const NOW = 1_800_000_000_000;
const EMAIL = "n8hchat@gen-lang-client-0001795560.iam.gserviceaccount.com";

test("the claims say who is asking, for what, and for how long", () => {
  const claims = buildClaims(EMAIL, NOW);
  assert.equal(claims.iss, EMAIL);
  assert.equal(claims.scope, CHAT_SCOPE);
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claims.exp - claims.iat, 3600);
});

test("the signature verifies against the public key", () => {
  const jwt = signJwt(buildClaims(EMAIL, NOW), pem);
  const [header, payload, signature] = jwt.split(".");
  const ok = createVerify("RSA-SHA256")
    .update(`${header}.${payload}`)
    .verify(publicKey, Buffer.from(signature, "base64url"));
  assert.ok(ok, "Google would reject this token");
});

// Standard base64 in a JWT is the classic silent failure: Google answers
// `invalid_grant` with nothing to go on.
test("every segment is base64url, with no +, / or =", () => {
  const jwt = signJwt(buildClaims(EMAIL, NOW), pem);
  assert.doesNotMatch(jwt, /[+/=]/);
  assert.equal(jwt.split(".").length, 3);
});

test("the payload round trips to the same claims", () => {
  const jwt = signJwt(buildClaims(EMAIL, NOW), pem);
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  assert.deepEqual(payload, buildClaims(EMAIL, NOW));
});

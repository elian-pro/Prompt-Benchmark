/**
 * Tamper-evident cookie payloads, HMAC-SHA256 over AUTH_SESSION_SECRET.
 *
 * Two cookies use this: the Google login session (`lib/auth/session.ts`) and
 * the anonymous visitor id on a client demo link. Neither encrypts anything.
 * The payload is readable base64url, it just cannot be edited without the
 * secret, which is all either one needs: the login carries an email that is
 * re-checked against the domain, and the demo cookie carries a random id that
 * means nothing on its own.
 *
 * Format:
 *
 *     base64url(JSON payload) "." base64url(HMAC signature)
 *
 * Web Crypto rather than node:crypto so the exact same code runs in the Edge
 * middleware and in Node route handlers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Any payload carrying an `exp` (unix seconds) is expired past it. */
export interface ExpiringPayload {
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function signingSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "Falta AUTH_SESSION_SECRET (o es demasiado corto). Genera uno con: openssl rand -hex 32",
    );
  }
  return secret;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPart(part: string): Promise<string> {
  const key = await importKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(part));
  return bytesToBase64Url(new Uint8Array(sig));
}

/** Constant-time string comparison to avoid leaking the signature via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Serializes and signs `payload`. Throws if the secret is missing. */
export async function signPayload(payload: unknown): Promise<string> {
  const part = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return part + "." + (await signPart(part));
}

/**
 * Verifies signature and expiry, returning the payload or null. Never throws
 * on malformed input, so a garbage cookie reads as "not logged in" rather than
 * a 500. Callers add their own checks on top (the login re-checks the domain).
 */
export async function verifyPayload<T extends ExpiringPayload>(
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<T | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadPart = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  let expected: string;
  try {
    expected = await signPart(payloadPart);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, signaturePart)) return null;

  let payload: T;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }

  if (typeof payload?.exp !== "number") return null;
  if (Math.floor(now / 1000) >= payload.exp) return null;

  return payload;
}

/**
 * A random, unguessable id. `bytes` random bytes as base64url, so 9 bytes give
 * 12 characters and 24 give 32.
 *
 * The demo link token uses the short form because it travels in a URL a client
 * reads on their phone. 9 bytes is 72 bits: guessing one is not a matter of
 * being lucky, it is an online attack against an endpoint that answers 404 and
 * rate limits by IP. The visitor cookie keeps the long form, where length costs
 * nothing.
 */
export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

/** Byte count behind a demo link token. See `randomToken`. */
export const LINK_TOKEN_BYTES = 9;

/**
 * Session tokens for the "Entrar con Google" login.
 *
 * The app owns its own auth: after Google confirms who you are, we mint a
 * signed session cookie here. No external auth service holds the session.
 *
 * The token is HMAC-SHA256 signed with AUTH_SESSION_SECRET using the Web
 * Crypto API (globalThis.crypto.subtle), so the exact same code runs in both
 * the Edge middleware and the Node route handlers. Format:
 *
 *     base64url(JSON payload) "." base64url(HMAC signature)
 *
 * The payload is readable (not encrypted) but tamper-evident: changing the
 * email or expiry invalidates the signature. Only email + expiry live in it,
 * nothing sensitive.
 */

export const SESSION_COOKIE = "zebra_session";
export const OAUTH_STATE_COOKIE = "zebra_oauth_state";

// One week. The team is 2 people on an internal tool, so a long-lived session
// is fine; they re-auth once a week at worst.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  email: string;
  /** Unix seconds. */
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The company domain access is restricted to. Overridable by env for future
 * reuse, defaults to Zebra's Workspace domain.
 */
export function allowedDomain(): string {
  return (process.env.AUTH_ALLOWED_DOMAIN || "zebradigital.marketing").toLowerCase();
}

/**
 * True only if `email` belongs to the allowed company domain. The leading "@"
 * anchors the match so a lookalike domain (e.g. "evilzebradigital.marketing")
 * can't slip through, and we require exactly one "@".
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized.split("@").length !== 2) return false;
  return normalized.endsWith("@" + allowedDomain());
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

function sessionSecret(): string {
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
    encoder.encode(sessionSecret()),
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

/** Mints a signed session token for `email`, valid for SESSION_TTL_SECONDS. */
export async function createSessionToken(
  email: string,
  now: number = Date.now(),
): Promise<string> {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadPart = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signPart(payloadPart);
  return payloadPart + "." + signature;
}

/**
 * Verifies a session token: signature valid, not expired, and (defense in
 * depth) the email still belongs to the allowed domain. Returns the payload
 * or null if anything fails. Never throws on malformed input.
 */
export async function verifySessionToken(
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<SessionPayload | null> {
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

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }

  if (typeof payload?.email !== "string" || typeof payload?.exp !== "number") {
    return null;
  }
  if (Math.floor(now / 1000) >= payload.exp) return null;
  if (!isEmailAllowed(payload.email)) return null;

  return payload;
}

/** Constant-time string comparison to avoid leaking the signature via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

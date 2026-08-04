/**
 * Session tokens for the "Entrar con Google" login.
 *
 * The app owns its own auth: after Google confirms who you are, we mint a
 * signed session cookie here. No external auth service holds the session.
 *
 * Signing, expiry and the constant-time compare live in
 * `lib/auth/signed-token.ts`, shared with the anonymous visitor cookie on a
 * demo link. What is specific to the login stays here: the payload carries an
 * email, and verifying re-checks that it still belongs to the company domain.
 */

import { signPayload, verifyPayload } from "./signed-token.ts";

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

/** Mints a signed session token for `email`, valid for SESSION_TTL_SECONDS. */
export async function createSessionToken(
  email: string,
  now: number = Date.now(),
): Promise<string> {
  return signPayload({
    email: email.trim().toLowerCase(),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  } satisfies SessionPayload);
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
  const payload = await verifyPayload<SessionPayload>(token, now);
  if (!payload) return null;
  if (typeof payload.email !== "string") return null;
  if (!isEmailAllowed(payload.email)) return null;
  return payload;
}

import { NextResponse, type NextRequest } from "next/server";
import {
  cookieSecure,
  exchangeCodeForIdentity,
  getBaseUrl,
} from "@/lib/auth/google";
import {
  allowedDomain,
  createSessionToken,
  isEmailAllowed,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session";

// Node runtime: exchanges the code with Google (fetch) and mints the session.
export const runtime = "nodejs";

function loginRedirect(request: NextRequest, error: string) {
  const url = new URL("/login", getBaseUrl(request));
  url.searchParams.set("error", error);
  const res = NextResponse.redirect(url);
  // The one-time state cookie is spent regardless of outcome.
  res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * Handles Google's redirect back: validates the CSRF state, exchanges the
 * code, enforces that the email is verified and in the company domain, and
 * only then sets the session cookie.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // Google reports its own errors (e.g. user cancelled) via `error`.
  if (url.searchParams.get("error")) {
    return loginRedirect(request, "google");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return loginRedirect(request, "state");
  }

  let identity;
  try {
    identity = await exchangeCodeForIdentity(request, code);
  } catch {
    return loginRedirect(request, "google");
  }

  const domain = allowedDomain();
  const domainMismatch = identity.hd != null && identity.hd.toLowerCase() !== domain;
  if (!identity.emailVerified || !isEmailAllowed(identity.email) || domainMismatch) {
    return loginRedirect(request, "domain");
  }

  const token = await createSessionToken(identity.email as string);
  const res = NextResponse.redirect(new URL("/", getBaseUrl(request)));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  res.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

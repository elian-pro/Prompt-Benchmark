import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Gates the whole app behind the "Entrar con Google" session. Every request
 * except the login page, the OAuth callback, the auth API routes, and static
 * assets must carry a valid session cookie whose email is in the company
 * domain (verifySessionToken re-checks the domain, not just the signature).
 *
 * Runs on the Edge runtime, which is why the session helpers use Web Crypto
 * rather than node:crypto.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);

  if (payload) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const res = NextResponse.redirect(loginUrl);
  // Drop a stale or tampered cookie so it doesn't linger across attempts.
  if (token) res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const config = {
  // Protect everything except the login flow and static assets.
  matcher: [
    "/((?!login|auth/callback|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};

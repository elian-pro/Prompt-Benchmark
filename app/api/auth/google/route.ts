import { NextResponse } from "next/server";
import { buildAuthUrl, cookieSecure } from "@/lib/auth/google";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";

// Node runtime: this route builds the Google URL and sets the CSRF state
// cookie. No session verification needed here.
export const runtime = "nodejs";

/**
 * Starts the login: generates a CSRF state, stores it in an httpOnly cookie,
 * and redirects the browser to Google's consent screen.
 */
export async function GET(request: Request) {
  let authUrl: string;
  try {
    const state = crypto.randomUUID();
    authUrl = buildAuthUrl(request, state);

    const res = NextResponse.redirect(authUrl);
    res.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: cookieSecure(request),
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes to complete the login
    });
    return res;
  } catch {
    // Misconfiguration (missing GOOGLE_CLIENT_ID, etc.). Send the user back to
    // the login page with a generic error rather than a stack trace.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "config");
    return NextResponse.redirect(loginUrl);
  }
}

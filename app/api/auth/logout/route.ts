import { NextResponse, type NextRequest } from "next/server";
import { getBaseUrl } from "@/lib/auth/google";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Clears the session cookie and returns the user to the login page. */
export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", getBaseUrl(request)));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

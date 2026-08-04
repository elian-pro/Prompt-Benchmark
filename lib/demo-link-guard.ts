/**
 * The gate in front of every public demo route.
 *
 * This is the first part of the project that answers requests without a Google
 * session behind them, and the middleware deliberately stops guarding these
 * paths. Since every route handler here talks to Supabase through the
 * service_role client, which bypasses RLS, nothing under `/api/prueba` may
 * touch the database before calling `openDemoContext`. That function is the
 * whole security model of the feature:
 *
 *   1. the token has to resolve to a link that exists and is open,
 *   2. the visitor gets a signed, httpOnly cookie so their conversation is
 *      theirs and cannot be swapped by editing a value in the browser,
 *   3. the link's own caps and a per IP rate limit bound what an open URL can
 *      cost.
 *
 * No name, no email, no account. The cookie holds a random id and nothing
 * else; the IP and user agent recorded next to the conversation are what makes
 * a disputed message arguable later.
 */
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { getLinkByToken, type DemoLink } from "./db/demo-links";
import { randomToken, signPayload, verifyPayload } from "./auth/signed-token.ts";
import { createRateLimiter, DEMO_MESSAGE_RULE } from "./rate-limit.ts";

export const DEMO_COOKIE = "zebra_demo";

/** A month. Long enough that a client testing across a couple of weeks keeps
 *  the same conversation, short enough to expire on its own. */
export const DEMO_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

type DemoCookiePayload = {
  /** Random visitor id. Means nothing outside this app. */
  vid: string;
  exp: number;
};

/** Carries the HTTP status the public routes should answer with, so a closed
 *  link reads as 409 and an unknown token as 404 without every route
 *  re-deriving it. */
export class DemoLinkError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "DemoLinkError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The caller's IP, from the proxy in front of the app (EasyPanel). The first
 * entry is the client; the rest are hops. Spoofable by anyone talking to the
 * app directly, which is why it is evidence and rate-limit input, never an
 * access decision.
 */
export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

export function userAgent(request: NextRequest): string | null {
  const ua = request.headers.get("user-agent");
  if (!ua) return null;
  // Long enough to tell devices apart, short enough not to store a paragraph.
  return ua.slice(0, 300);
}

export type DemoContext = {
  link: DemoLink;
  visitorId: string;
  /** True when the cookie was just minted and still has to be set on the
   *  response. Routes pass this to `withVisitorCookie`. */
  isNewVisitor: boolean;
  ip: string | null;
  userAgent: string | null;
};

/**
 * Resolves the token and the visitor. Throws `DemoLinkError` for anything that
 * should not proceed.
 *
 * An unknown token and a deleted one both answer 404 on purpose: telling them
 * apart would confirm to someone guessing that a token was once real.
 */
export async function openDemoContext(
  request: NextRequest,
  token: string,
): Promise<DemoContext> {
  const link = await getLinkByToken(token);
  if (!link) {
    throw new DemoLinkError("Este link no existe o ya no está disponible.", 404);
  }
  if (link.status !== "active") {
    throw new DemoLinkError(
      "Esta ronda de pruebas ya se cerró. Escríbenos si necesitas seguir probando.",
      409,
    );
  }

  const existing = await verifyPayload<DemoCookiePayload>(
    request.cookies.get(DEMO_COOKIE)?.value,
  );
  const visitorId = existing?.vid ?? randomToken();

  return {
    link,
    visitorId,
    isNewVisitor: !existing,
    ip: clientIp(request),
    userAgent: userAgent(request),
  };
}

/** Sets the visitor cookie when it was just minted. Idempotent to call. */
export async function withVisitorCookie<T extends NextResponse>(
  response: T,
  context: DemoContext,
): Promise<T> {
  if (!context.isNewVisitor) return response;

  const value = await signPayload({
    vid: context.visitorId,
    exp: Math.floor(Date.now() / 1000) + DEMO_COOKIE_TTL_SECONDS,
  } satisfies DemoCookiePayload);

  response.cookies.set(DEMO_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_COOKIE_TTL_SECONDS,
  });
  return response;
}

// One limiter for the whole process, keyed by IP. Created at module load so it
// survives between requests.
const messageLimiter = createRateLimiter(DEMO_MESSAGE_RULE);

/** Throws 429 when this IP is sending faster than a person types. */
export function assertMessageRate(context: DemoContext): void {
  // No IP means we cannot tell callers apart, so fall back to the link: a
  // shared bucket is worse for legitimate users but still bounds the spend.
  const key = context.ip ?? `link:${context.link.id}`;
  const verdict = messageLimiter.check(key);
  if (verdict.ok) return;

  const seconds = Math.ceil(verdict.retryAfterMs / 1000);
  throw new DemoLinkError(
    seconds > 60
      ? "Has enviado muchos mensajes en poco tiempo. Inténtalo de nuevo más tarde."
      : `Espera unos segundos antes de enviar otro mensaje.`,
    429,
    seconds,
  );
}

/** The link's own ceilings, checked against what has already happened. */
export function assertSessionCap(link: DemoLink, sessionCount: number): void {
  if (sessionCount >= link.max_sessions) {
    throw new DemoLinkError(
      "Este link ya alcanzó su número máximo de conversaciones. Escríbenos para abrir otra ronda.",
      409,
    );
  }
}

export function assertMessageCap(link: DemoLink, messageCount: number): void {
  if (messageCount >= link.max_messages) {
    throw new DemoLinkError(
      "Esta conversación alcanzó su límite de mensajes. Escríbenos si necesitas seguir probando.",
      409,
    );
  }
}

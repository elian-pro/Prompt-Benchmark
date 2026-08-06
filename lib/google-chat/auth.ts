/**
 * Service account authentication for the Google Chat API, on `node:crypto`.
 *
 * Google's own libraries would each pull a dependency tree for what is, in the
 * end, one signed JWT traded for an access token. `lib/crypto.ts` already uses
 * `node:crypto`, so the signing is four lines and `package.json` does not grow.
 *
 * The credentials are env vars, not a settings row: a key issued by Google
 * Cloud is not something the team edits from a page, and leaving it out of the
 * database means no third kind of encrypted column. Blank disables the whole
 * integration, the same convention as `isChatsAdminConfigured()`.
 */
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** App authentication for a Chat app. Posting as the app, not as a person. */
export const CHAT_SCOPE = "https://www.googleapis.com/auth/chat.bot";
const TOKEN_TTL_SECONDS = 3600;
const TIMEOUT_MS = 15_000;

export class GoogleChatError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "GoogleChatError";
    this.status = status;
  }
}

export function isGoogleChatConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CHAT_CLIENT_EMAIL && process.env.GOOGLE_CHAT_PRIVATE_KEY);
}

function credentials(): { email: string; privateKey: string } {
  const email = process.env.GOOGLE_CHAT_CLIENT_EMAIL;
  // An env var carries the key on one line, so its newlines arrive as the two
  // characters backslash-n and have to become real ones before OpenSSL will
  // read the PEM.
  const privateKey = process.env.GOOGLE_CHAT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new GoogleChatError(
      "Falta configurar la cuenta de servicio de Google Chat en el servidor.",
    );
  }
  return { email, privateKey };
}

export type JwtClaims = {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
};

export function buildClaims(email: string, now: number): JwtClaims {
  const iat = Math.floor(now / 1000);
  return { iss: email, scope: CHAT_SCOPE, aud: TOKEN_URL, iat, exp: iat + TOKEN_TTL_SECONDS };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * A signed RS256 JWT. Pure and deterministic given the claims, which is what
 * makes it the piece worth testing: base64url is the difference between a token
 * Google accepts and a generic `invalid_grant` with no explanation.
 */
export function signJwt(claims: JwtClaims, privateKeyPem: string): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

/** ponytail: the token is cached per process. A second replica mints its own,
 *  which is fine: there is nothing to share and nothing to invalidate. */
let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(now: number = Date.now()): Promise<string> {
  // A minute of slack, so a token that is about to expire is never handed to a
  // request that will still be in flight when it does.
  if (cached && now < cached.expiresAt - 60_000) return cached.token;

  const { email, privateKey } = credentials();
  const assertion = signJwt(buildClaims(email, now), privateKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GoogleChatError("Google no respondió a tiempo al pedir el token.");
    }
    throw new GoogleChatError("No se pudo contactar a Google para autenticar.");
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GoogleChatError(
      `Google rechazó las credenciales de la cuenta de servicio: ${
        body.error_description ?? body.error ?? res.status
      }`,
      res.status,
    );
  }

  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? TOKEN_TTL_SECONDS) * 1000,
  };
  return cached.token;
}

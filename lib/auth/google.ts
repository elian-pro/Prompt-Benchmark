/**
 * Google OAuth (authorization code flow), talking to Google directly. No
 * external auth broker: the app builds the consent URL, exchanges the code,
 * and reads the identity itself.
 *
 * Security note on the id_token: we receive it server-to-server from Google's
 * token endpoint over TLS, so per Google's own guidance for the authorization
 * code flow its contents can be trusted without re-verifying the RSA
 * signature. We still only accept a verified email in the allowed domain (see
 * the callback route) before minting a session.
 */

import { allowedDomain } from "./session";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * The app's public base URL. Behind the EasyPanel proxy the incoming request
 * host may be internal, so prefer AUTH_BASE_URL when set, then the forwarded
 * headers, then the request origin. This must resolve to the same value the
 * redirect URI is registered under in Google Cloud.
 */
export function getBaseUrl(request: Request): string {
  const configured = process.env.AUTH_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export function redirectUri(request: Request): string {
  return getBaseUrl(request) + "/auth/callback";
}

/** Whether cookies should carry the Secure flag (true on https). */
export function cookieSecure(request: Request): boolean {
  return getBaseUrl(request).startsWith("https://");
}

function googleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

/** Builds the Google consent URL the user is redirected to. */
export function buildAuthUrl(request: Request, state: string): string {
  const { clientId } = googleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
    // Hint Google to preselect the company Workspace domain. This is only a
    // hint; the real gate is the domain check on the returned email.
    hd: allowedDomain(),
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  email: string | null;
  emailVerified: boolean;
  /** Google Workspace hosted domain claim, when present. */
  hd: string | null;
}

function base64UrlDecodeToString(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Reads email / email_verified / hd from a Google id_token payload. */
export function decodeIdToken(idToken: string): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token con formato inválido.");
  const claims = JSON.parse(base64UrlDecodeToString(parts[1]));
  return {
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified:
      claims.email_verified === true || claims.email_verified === "true",
    hd: typeof claims.hd === "string" ? claims.hd : null,
  };
}

/** Exchanges the authorization code for the caller's Google identity. */
export async function exchangeCodeForIdentity(
  request: Request,
  code: string,
): Promise<GoogleIdentity> {
  const { clientId, clientSecret } = googleCredentials();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(request),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`El endpoint de token de Google respondió ${res.status}.`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google no devolvió id_token.");
  return decodeIdToken(data.id_token);
}

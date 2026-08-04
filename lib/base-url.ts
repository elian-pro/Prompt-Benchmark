/**
 * The app's public origin, as seen from outside.
 *
 * There is exactly one correct answer here and three places that need it: the
 * OAuth redirect URI, the `metadataBase` that turns an Open Graph image path
 * into an absolute URL, and any link the server writes into a page.
 *
 * Order matters. `AUTH_BASE_URL` wins because behind the EasyPanel proxy the
 * app may not be able to tell what host the browser actually typed. When it is
 * not set we reconstruct it from the forwarded headers, which is what makes a
 * link preview work on a deploy nobody remembered to configure: falling back to
 * localhost instead means WhatsApp is handed an image URL it can never fetch,
 * and the card silently renders with no image at all.
 */
export function baseUrlFromHeaders(headers: Headers): string | null {
  const configured = process.env.AUTH_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;

  const proto = headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

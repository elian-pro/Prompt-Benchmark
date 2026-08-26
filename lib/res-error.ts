/**
 * Message for a failed fetch. Prefers the API's Spanish `error` envelope
 * (see `lib/http.ts`); falls back to the caller's text plus the status code
 * when the body is not JSON, which is what a platform error page sends: a
 * gateway timeout, a 404 outside the app, a crashed dev build. Parsing that
 * HTML with `res.json()` used to throw and replace the real failure with
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 */
export async function resError(res: Response, fallback: string): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  const message =
    data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
      ? (data as { error: string }).error
      : null;
  return message ?? `${fallback} (HTTP ${res.status})`;
}

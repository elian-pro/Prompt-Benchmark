/**
 * The Google Chat API, in the two calls this app makes: list the spaces the
 * app can post to, and post a message.
 *
 * Same shape as `lib/n8n/client.ts`, deliberately: one `request` with an
 * AbortController, a typed error carrying the upstream status, and no retry.
 * A failed notification is not worth a queue (see `notify.ts` for why).
 */
import { getAccessToken, GoogleChatError } from "./auth.ts";

const API = "https://chat.googleapis.com/v1";
const TIMEOUT_MS = 15_000;
/** A cursor loop needs a stop: a team has spaces, not thousands of them. */
const MAX_PAGES = 20;

export { GoogleChatError, isGoogleChatConfigured } from "./auth.ts";

async function request(path: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GoogleChatError("Google Chat no respondió a tiempo.");
    }
    throw new GoogleChatError("No se pudo contactar a Google Chat.");
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    // 403 here is almost always the app itself, not the key: the Chat app has
    // to be configured in the Google Cloud project and added to the space.
    if (res.status === 401 || res.status === 403) {
      throw new GoogleChatError(
        `Google Chat rechazó la petición (${res.status}). Revisa que la app de Chat esté configurada en el proyecto y agregada al espacio: ${
          body?.error?.message ?? "sin detalle"
        }`,
        res.status,
      );
    }
    throw new GoogleChatError(
      `Google Chat respondió ${res.status}: ${body?.error?.message ?? "sin detalle"}`,
      res.status,
    );
  }
  return body;
}

export type ChatSpace = { name: string; displayName: string };

/**
 * The spaces this app belongs to. With app credentials Google only ever
 * returns those, which is exactly the list the picker wants: somewhere the app
 * was never added could not receive a message anyway.
 */
export async function listSpaces(): Promise<ChatSpace[]> {
  const spaces: ChatSpace[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const body = await request(`/spaces?${query}`);
    for (const space of body.spaces ?? []) {
      spaces.push({
        name: space.name,
        // A direct message has no display name; naming it by its id is better
        // than an empty option in a select.
        displayName: space.displayName || space.name,
      });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return spaces;
}

export async function postMessage(space: string, text: string): Promise<void> {
  await request(`/${space}/messages`, { method: "POST", body: JSON.stringify({ text }) });
}

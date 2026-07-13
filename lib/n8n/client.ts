/**
 * Thin REST client for the n8n public API, scoped to one connection.
 *
 * Server-side only (it carries a decrypted API key). Callers pass a connection
 * (base URL + plaintext key); this module never touches the DB or crypto. All
 * error messages are in Spanish because they surface directly in the UI.
 *
 * We only ever read and write whole workflows: n8n has no partial update, so
 * `updateWorkflow` sends the full object back. `sanitizeForUpdate` strips the
 * read-only fields the API rejects (id, active, timestamps, tags, ...).
 */
import type { N8nWorkflow } from "./agent-node";

export type N8nConnectionCreds = {
  baseUrl: string;
  apiKey: string;
};

export type WorkflowListItem = {
  id: string;
  name: string;
  active: boolean;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** Custom error so API routes can distinguish an n8n failure from others. */
export class N8nApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "N8nApiError";
    this.status = status;
  }
}

function apiRoot(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v1`;
}

async function request(
  creds: N8nConnectionCreds,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(`${apiRoot(creds.baseUrl)}${path}`, {
      ...init,
      headers: {
        "X-N8N-API-KEY": creds.apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new N8nApiError("n8n no respondió a tiempo. Revisa la conexión.");
    }
    throw new N8nApiError("No se pudo contactar a n8n. Revisa la URL y la red.");
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureOk(res: Response, action: string): Promise<Response> {
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) {
    throw new N8nApiError("n8n rechazó la API key. Verifícala en Ajustes.", res.status);
  }
  if (res.status === 404) {
    throw new N8nApiError("El recurso no existe en n8n (404).", 404);
  }
  let detail = "";
  try {
    const body = await res.json();
    detail = typeof body?.message === "string" ? `: ${body.message}` : "";
  } catch {
    // no JSON body
  }
  throw new N8nApiError(`${action} falló en n8n (${res.status})${detail}.`, res.status);
}

/**
 * Lists ALL workflows for the picker, following n8n's cursor pagination
 * (`{ data, nextCursor }`). n8n caps `limit` at 250 and returns a
 * `nextCursor` when more pages exist; we loop until it's null so instances
 * with hundreds of workflows show every one. The safety cap stops a runaway
 * loop if the API ever misbehaves.
 */
export async function listWorkflows(creds: N8nConnectionCreds): Promise<WorkflowListItem[]> {
  const out: WorkflowListItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const qs = `/workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await ensureOk(await request(creds, qs), "Listar flujos");
    const body = await res.json();
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const w of rows) out.push({ id: String(w.id), name: w.name, active: !!w.active });
    cursor = body?.nextCursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/** Reads one workflow in full (needed for the node picker, push and drift). */
export async function getWorkflow(
  creds: N8nConnectionCreds,
  workflowId: string,
): Promise<N8nWorkflow> {
  const res = await ensureOk(
    await request(creds, `/workflows/${encodeURIComponent(workflowId)}`),
    "Obtener el flujo",
  );
  return (await res.json()) as N8nWorkflow;
}

/**
 * The only `settings` keys n8n's public PUT schema accepts. The GET response
 * carries extra UI/enterprise-only fields (`callerPolicy`, `timeSavedMode`,
 * `timeSavedPerExecution`, `availableInMCP`, `binaryMode`, ...) that the PUT
 * rejects with "settings must NOT have additional properties" (HTTP 400), so
 * we keep only this allow-list and drop the rest.
 */
const ALLOWED_SETTINGS_KEYS = [
  "saveExecutionProgress",
  "saveManualExecutions",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "executionTimeout",
  "errorWorkflow",
  "timezone",
  "executionOrder",
] as const;

/** Keeps only the settings keys the public API's PUT schema allows. */
export function sanitizeSettings(settings: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (settings && typeof settings === "object") {
    for (const key of ALLOWED_SETTINGS_KEYS) {
      const value = (settings as Record<string, unknown>)[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

/**
 * Strips read-only fields n8n's PUT rejects, keeping only the writable core.
 * `settings` is further filtered to the keys the PUT schema accepts (see
 * sanitizeSettings). Exported for unit testing.
 */
export function sanitizeForUpdate(workflow: N8nWorkflow): Record<string, unknown> {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: sanitizeSettings(workflow.settings),
  };
}

/** Writes a whole workflow back. Caller must send a freshly-read object. */
export async function updateWorkflow(
  creds: N8nConnectionCreds,
  workflowId: string,
  workflow: N8nWorkflow,
): Promise<N8nWorkflow> {
  const res = await ensureOk(
    await request(creds, `/workflows/${encodeURIComponent(workflowId)}`, {
      method: "PUT",
      body: JSON.stringify(sanitizeForUpdate(workflow)),
    }),
    "Actualizar el flujo",
  );
  return (await res.json()) as N8nWorkflow;
}

/** Lightweight reachability check for the "Probar conexión" button. */
export async function testConnection(creds: N8nConnectionCreds): Promise<void> {
  await ensureOk(await request(creds, "/workflows?limit=1"), "Probar conexión");
}

/**
 * Data access for a client's agent tools (migration 027).
 *
 * Headers are stored encrypted (lib/crypto.ts) and NEVER returned in plaintext
 * through these helpers, except `getRuntimeTools`, which is for internal
 * server-side use by the turn runner and must never reach a response body.
 */
import { getSupabase } from "../supabase";
import { encrypt, decrypt } from "../crypto";
import type { ToolParam } from "../providers/types";

export type MaskedTool = {
  id: string;
  client_id: string;
  name: string;
  description: string;
  url: string;
  /** Header names in the clear, values masked: enough to spot a wrong key
   *  without handing it back to the browser. */
  headers_masked: Record<string, string>;
  params: ToolParam[];
  body_template: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

/** What the turn runner needs: the real URL and headers. */
export type RuntimeTool = {
  id: string;
  name: string;
  description: string;
  url: string;
  headers: Record<string, string>;
  params: ToolParam[];
  bodyTemplate: Record<string, unknown>;
};

/** Custom error so the API route can map a duplicate name to HTTP 409. */
export class ToolNameTakenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolNameTakenError";
  }
}

function maskValue(plain: string): string {
  return plain.length > 4 ? `••••${plain.slice(-4)}` : "••••";
}

function parseHeaders(encrypted: string): Record<string, string> {
  return JSON.parse(decrypt(encrypted));
}

function toMasked(row: any): MaskedTool {
  let headers_masked: Record<string, string>;
  try {
    headers_masked = Object.fromEntries(
      Object.entries(parseHeaders(row.headers_encrypted)).map(([k, v]) => [
        k,
        maskValue(String(v)),
      ]),
    );
  } catch {
    // Present but undecryptable (e.g. KEY_ENCRYPTION_SECRET rotated).
    headers_masked = { "": "•••• (no legible)" };
  }
  return {
    id: row.id,
    client_id: row.client_id,
    name: row.name,
    description: row.description,
    url: row.url,
    headers_masked,
    params: row.params ?? [],
    body_template: row.body_template ?? {},
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listTools(clientId: string): Promise<MaskedTool[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("client_tools")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron listar las herramientas: ${error.message}`);
  return (data ?? []).map(toMasked);
}

export async function createTool(
  clientId: string,
  input: {
    name: string;
    description: string;
    url: string;
    headers: Record<string, string>;
    params: ToolParam[];
    body_template: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<MaskedTool> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("client_tools")
    .insert({
      client_id: clientId,
      name: input.name,
      description: input.description,
      url: input.url,
      headers_encrypted: encrypt(JSON.stringify(input.headers)),
      params: input.params,
      body_template: input.body_template,
      enabled: input.enabled ?? true,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ToolNameTakenError("Ya hay una herramienta con ese nombre en este cliente.");
    }
    throw new Error(`No se pudo crear la herramienta: ${error.message}`);
  }
  return toMasked(data);
}

export async function updateTool(
  clientId: string,
  toolId: string,
  input: {
    name?: string;
    description?: string;
    url?: string;
    headers?: Record<string, string>;
    params?: ToolParam[];
    body_template?: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<MaskedTool> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.url !== undefined) patch.url = input.url;
  // Re-encrypt only when new headers arrive; absent leaves the stored ones.
  if (input.headers !== undefined) {
    patch.headers_encrypted = encrypt(JSON.stringify(input.headers));
  }
  if (input.params !== undefined) patch.params = input.params;
  if (input.body_template !== undefined) patch.body_template = input.body_template;
  if (input.enabled !== undefined) patch.enabled = input.enabled;

  const { data, error } = await sb
    .from("client_tools")
    .update(patch)
    .eq("id", toolId)
    .eq("client_id", clientId)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ToolNameTakenError("Ya hay una herramienta con ese nombre en este cliente.");
    }
    throw new Error(`No se pudo actualizar la herramienta: ${error.message}`);
  }
  return toMasked(data);
}

export async function deleteTool(clientId: string, toolId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("client_tools")
    .delete()
    .eq("id", toolId)
    .eq("client_id", clientId);
  if (error) throw new Error(`No se pudo eliminar la herramienta: ${error.message}`);
}

/**
 * The client's enabled tools with their headers decrypted. INTERNAL USE ONLY
 * (the turn runner). Never expose the result through a response.
 *
 * A tool whose headers cannot be decrypted is skipped rather than thrown on: a
 * rotated secret should not take down every conversation in the Playground.
 */
export async function getRuntimeTools(clientId: string): Promise<RuntimeTool[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("client_tools")
    .select("*")
    .eq("client_id", clientId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las herramientas: ${error.message}`);
  const tools: RuntimeTool[] = [];
  for (const row of data ?? []) {
    try {
      tools.push({
        id: row.id,
        name: row.name,
        description: row.description,
        url: row.url,
        headers: parseHeaders(row.headers_encrypted),
        params: row.params ?? [],
        bodyTemplate: row.body_template ?? {},
      });
    } catch {
      continue;
    }
  }
  return tools;
}

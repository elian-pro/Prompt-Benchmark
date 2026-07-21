/**
 * Data access for n8n connections (reachable n8n instances).
 *
 * Keys are stored encrypted (lib/crypto.ts) and NEVER returned in plaintext
 * through these helpers, except `getConnectionCreds`, which is for internal
 * server-side use by the sync engine / API routes and must never be exposed
 * to the client.
 */
import { getSupabase } from "../supabase";
import { encrypt, decrypt } from "../crypto";
import type { N8nConnectionCreds } from "../n8n/client";

export type MaskedConnection = {
  id: string;
  name: string;
  base_url: string;
  api_key_masked: string;
  created_at: string;
  updated_at: string;
};

/** Custom error so API routes can map a delete conflict to HTTP 409. */
export class ConnectionInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionInUseError";
  }
}

function maskKey(plain: string): string {
  return `••••${plain.slice(-4)}`;
}

function maskFromEncrypted(encrypted: string): string {
  try {
    return maskKey(decrypt(encrypted));
  } catch {
    // Key present but undecryptable (e.g. KEY_ENCRYPTION_SECRET rotated).
    return "•••• (no legible)";
  }
}

function toMasked(row: any): MaskedConnection {
  return {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    api_key_masked: maskFromEncrypted(row.api_key_encrypted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listConnections(): Promise<MaskedConnection[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_connections")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron listar las conexiones n8n: ${error.message}`);
  return (data ?? []).map(toMasked);
}

export async function getConnection(id: string): Promise<MaskedConnection | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_connections")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener la conexión n8n: ${error.message}`);
  return data ? toMasked(data) : null;
}

export async function createConnection(input: {
  name: string;
  base_url: string;
  api_key: string;
}): Promise<MaskedConnection> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_connections")
    .insert({
      name: input.name,
      base_url: input.base_url,
      api_key_encrypted: encrypt(input.api_key),
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo crear la conexión n8n: ${error.message}`);
  return toMasked(data);
}

export async function updateConnection(
  id: string,
  input: { name?: string; base_url?: string; api_key?: string },
): Promise<MaskedConnection> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.base_url !== undefined) patch.base_url = input.base_url;
  // Re-encrypt only when a new key is provided; blank leaves the existing one.
  if (input.api_key) patch.api_key_encrypted = encrypt(input.api_key);

  const { data, error } = await sb
    .from("n8n_connections")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo actualizar la conexión n8n: ${error.message}`);
  return toMasked(data);
}

export async function deleteConnection(id: string): Promise<void> {
  const sb = getSupabase();
  // Bindings reference the connection with ON DELETE RESTRICT at the DB level;
  // check here first so we can return a friendly Spanish message.
  const { data: refs, error: refErr } = await sb
    .from("n8n_bindings")
    .select("id")
    .eq("connection_id", id)
    .limit(1);
  if (refErr) throw new Error(`No se pudo verificar la conexión n8n: ${refErr.message}`);
  if (refs && refs.length > 0) {
    throw new ConnectionInUseError(
      "No se puede eliminar la conexión: hay clientes vinculados a ella. Desvincúlalos primero.",
    );
  }
  const { error } = await sb.from("n8n_connections").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar la conexión n8n: ${error.message}`);
}

/**
 * Returns the base URL + plaintext API key for a connection. INTERNAL USE
 * ONLY (sync engine / server-side API routes). Never expose via a response.
 */
export async function getConnectionCreds(id: string): Promise<N8nConnectionCreds> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_connections")
    .select("base_url, api_key_encrypted")
    .eq("id", id)
    .single();
  if (error) throw new Error(`No se pudo obtener la conexión n8n: ${error.message}`);
  return { baseUrl: data.base_url, apiKey: decrypt(data.api_key_encrypted) };
}

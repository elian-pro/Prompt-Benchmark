/**
 * Data access for providers and their models.
 *
 * Keys are stored encrypted (lib/crypto.ts) and NEVER returned in plaintext
 * through these helpers — except `getDecryptedKey`, which is for internal use
 * by lib/providers/index.ts only and must never be exposed via an API route.
 */
import { getSupabase } from "../supabase";
import { encrypt, decrypt } from "../crypto";

export type AdapterType = "openai_compat" | "anthropic" | "google" | "openrouter";

export type ProviderModel = {
  id: string;
  provider_id: string;
  model_name: string;
  display_name: string | null;
  enabled: boolean;
};

export type MaskedProvider = {
  id: string;
  name: string;
  adapter_type: AdapterType;
  base_url: string | null;
  api_key_masked: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  models: ProviderModel[];
};

/** Custom error so API routes can map a delete conflict to HTTP 409. */
export class ProviderInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderInUseError";
  }
}

/** Mask a plaintext key per adapter type. Shows only a hint of the tail. */
function maskKey(adapterType: AdapterType, plain: string): string {
  switch (adapterType) {
    case "anthropic":
      return `sk-ant-…${plain.slice(-4)}`;
    case "google":
      return `AIza…${plain.slice(-3)}`;
    case "openai_compat":
    case "openrouter":
      return `sk-…${plain.slice(-4)}`;
    default:
      return `…${plain.slice(-4)}`;
  }
}

function maskFromEncrypted(adapterType: AdapterType, encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return maskKey(adapterType, decrypt(encrypted));
  } catch {
    // Key present but undecryptable (e.g. KEY_ENCRYPTION_SECRET rotated).
    return "•••• (no legible)";
  }
}

function toMaskedProvider(row: any): MaskedProvider {
  const models: ProviderModel[] = (row.provider_models ?? []).map((m: any) => ({
    id: m.id,
    provider_id: m.provider_id ?? row.id,
    model_name: m.model_name,
    display_name: m.display_name ?? null,
    enabled: m.enabled,
  }));
  return {
    id: row.id,
    name: row.name,
    adapter_type: row.adapter_type,
    base_url: row.base_url ?? null,
    api_key_masked: maskFromEncrypted(row.adapter_type, row.api_key_encrypted ?? null),
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
    models,
  };
}

export async function listProviders(): Promise<MaskedProvider[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("providers")
    .select("*, provider_models(*)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron listar los proveedores: ${error.message}`);
  return (data ?? []).map(toMaskedProvider);
}

export async function getProvider(id: string): Promise<MaskedProvider | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("providers")
    .select("*, provider_models(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener el proveedor: ${error.message}`);
  return data ? toMaskedProvider(data) : null;
}

export async function createProvider(input: {
  name: string;
  adapter_type: AdapterType;
  base_url?: string | null;
  api_key?: string | null;
  enabled?: boolean;
}): Promise<MaskedProvider> {
  const sb = getSupabase();
  const row = {
    name: input.name,
    adapter_type: input.adapter_type,
    base_url: input.base_url ?? null,
    api_key_encrypted: input.api_key ? encrypt(input.api_key) : null,
    enabled: input.enabled ?? true,
  };
  const { data, error } = await sb.from("providers").insert(row).select("*").single();
  if (error) throw new Error(`No se pudo crear el proveedor: ${error.message}`);
  return toMaskedProvider(data);
}

export async function updateProvider(
  id: string,
  input: {
    name?: string;
    adapter_type?: AdapterType;
    base_url?: string | null;
    api_key?: string | null;
    enabled?: boolean;
  },
): Promise<MaskedProvider> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.adapter_type !== undefined) patch.adapter_type = input.adapter_type;
  if (input.base_url !== undefined) patch.base_url = input.base_url;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  // Re-encrypt only when a new key is provided. An explicit null clears it.
  if (input.api_key !== undefined) {
    patch.api_key_encrypted = input.api_key ? encrypt(input.api_key) : null;
  }

  const { data, error } = await sb
    .from("providers")
    .update(patch)
    .eq("id", id)
    .select("*, provider_models(*)")
    .single();
  if (error) throw new Error(`No se pudo actualizar el proveedor: ${error.message}`);
  return toMaskedProvider(data);
}

export async function deleteProvider(id: string): Promise<void> {
  const sb = getSupabase();
  const { data: refs, error: refErr } = await sb
    .from("role_defaults")
    .select("role")
    .eq("provider_id", id);
  if (refErr) throw new Error(`No se pudo verificar el proveedor: ${refErr.message}`);
  if (refs && refs.length > 0) {
    const roles = refs.map((r: any) => r.role).join(", ");
    throw new ProviderInUseError(
      `No se puede eliminar el proveedor: está asignado a uno o más roles (${roles}).`,
    );
  }
  const { error } = await sb.from("providers").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el proveedor: ${error.message}`);
}

/**
 * Returns the plaintext API key. INTERNAL USE ONLY (lib/providers/index.ts).
 * Never expose this through an API route.
 */
export async function getDecryptedKey(id: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("providers")
    .select("api_key_encrypted")
    .eq("id", id)
    .single();
  if (error) throw new Error(`No se pudo obtener la clave del proveedor: ${error.message}`);
  if (!data?.api_key_encrypted) {
    throw new Error("El proveedor no tiene una API key configurada.");
  }
  return decrypt(data.api_key_encrypted);
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

function toModel(row: any): ProviderModel {
  return {
    id: row.id,
    provider_id: row.provider_id,
    model_name: row.model_name,
    display_name: row.display_name ?? null,
    enabled: row.enabled,
  };
}

export async function listModels(providerId: string): Promise<ProviderModel[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("provider_models")
    .select("*")
    .eq("provider_id", providerId)
    .order("model_name", { ascending: true });
  if (error) throw new Error(`No se pudieron listar los modelos: ${error.message}`);
  return (data ?? []).map(toModel);
}

export async function addModel(
  providerId: string,
  input: { model_name: string; display_name?: string | null },
): Promise<ProviderModel> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("provider_models")
    .insert({
      provider_id: providerId,
      model_name: input.model_name,
      display_name: input.display_name ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo agregar el modelo: ${error.message}`);
  return toModel(data);
}

export async function removeModel(modelId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("provider_models").delete().eq("id", modelId);
  if (error) throw new Error(`No se pudo eliminar el modelo: ${error.message}`);
}

export async function toggleModel(modelId: string, enabled: boolean): Promise<ProviderModel> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("provider_models")
    .update({ enabled })
    .eq("id", modelId)
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo actualizar el modelo: ${error.message}`);
  return toModel(data);
}

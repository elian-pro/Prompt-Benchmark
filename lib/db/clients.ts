/**
 * Data access for clients.
 *
 * Filter semantics for listClients (see docs/SPEC.md filter chips):
 * - 'all'        → non-archived clients.
 * - 'production' → non-archived clients that have a production version.
 * - 'editing'    → non-archived clients with no production version yet.
 * - 'legacy'     → non-archived clients flagged is_legacy.
 * - 'archived'   → archived clients only.
 */
import { getSupabase } from "../supabase";
import { listVersions } from "./versions";
import type { VersionListItem, Version } from "./versions";

export type ClientFilter = "all" | "production" | "editing" | "legacy" | "archived";

export type Client = {
  id: string;
  name: string;
  segment: string | null;
  location: string | null;
  notes: string | null;
  is_legacy: boolean;
  archived_at: string | null;
  draft_content: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientSummary = Client & {
  version_count: number;
  latest_version_number: string | null;
  latest_version_created_at: string | null;
  latest_version_bump_type: "major" | "minor" | "imported" | null;
  production_version_number: string | null;
  last_update_at: string;
};

export type ClientDetail = Client & {
  versions: VersionListItem[];
  production_version: Version | null;
};

type NestedVersion = {
  version_number: string;
  created_at: string;
  bump_type: "major" | "minor" | "imported" | null;
  is_production: boolean;
};

function toSummary(row: any): ClientSummary {
  const versions: NestedVersion[] = row.versions ?? [];
  const sorted = [...versions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = sorted[0] ?? null;
  const production = versions.find((v) => v.is_production) ?? null;
  const { versions: _omit, ...client } = row;
  return {
    ...(client as Client),
    version_count: versions.length,
    latest_version_number: latest?.version_number ?? null,
    latest_version_created_at: latest?.created_at ?? null,
    latest_version_bump_type: latest?.bump_type ?? null,
    production_version_number: production?.version_number ?? null,
    last_update_at: latest?.created_at ?? row.updated_at,
  };
}

export async function listClients({
  filter,
  search,
}: {
  filter: ClientFilter;
  search?: string;
}): Promise<ClientSummary[]> {
  const sb = getSupabase();
  let query = sb
    .from("clients")
    .select("*, versions(version_number, created_at, bump_type, is_production)");

  if (filter === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }
  if (filter === "legacy") {
    query = query.eq("is_legacy", true);
  }
  if (search && search.trim()) {
    // Strip characters that would break the PostgREST or() grammar.
    const term = search.trim().replace(/[%,()]/g, "");
    if (term) {
      query = query.or(
        `name.ilike.%${term}%,segment.ilike.%${term}%,location.ilike.%${term}%`,
      );
    }
  }
  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar los clientes: ${error.message}`);

  let rows = (data ?? []).map(toSummary);
  if (filter === "production") {
    rows = rows.filter((r) => r.production_version_number !== null);
  } else if (filter === "editing") {
    rows = rows.filter((r) => r.production_version_number === null);
  }
  return rows;
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  const sb = getSupabase();
  const { data: client, error } = await sb
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener el cliente: ${error.message}`);
  if (!client) return null;

  const versions = await listVersions(id);

  const { data: prod, error: pErr } = await sb
    .from("versions")
    .select("*")
    .eq("client_id", id)
    .eq("is_production", true)
    .maybeSingle();
  if (pErr) throw new Error(`No se pudo obtener la versión de producción: ${pErr.message}`);

  return {
    ...(client as Client),
    versions,
    production_version: (prod as Version | null) ?? null,
  };
}

export async function createClient(input: {
  name: string;
  segment?: string | null;
  location?: string | null;
  notes?: string | null;
}): Promise<{ client: Client; version: Version }> {
  const sb = getSupabase();
  const { data: client, error } = await sb
    .from("clients")
    .insert({
      name: input.name,
      segment: input.segment ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo crear el cliente: ${error.message}`);

  // Seed an empty v1.0 directly (not via createVersion, which always bumps).
  // Not production — a brand-new client is "en edición" until promoted.
  const { data: version, error: vErr } = await sb
    .from("versions")
    .insert({
      client_id: (client as Client).id,
      version_number: "v1.0",
      content: "",
      is_production: false,
      bump_type: null,
      source: "manual",
    })
    .select("*")
    .single();
  if (vErr) throw new Error(`No se pudo crear la versión inicial: ${vErr.message}`);

  return { client: client as Client, version: version as Version };
}

export async function updateClient(
  id: string,
  input: {
    name?: string;
    segment?: string | null;
    location?: string | null;
    notes?: string | null;
    draft_content?: string | null;
  },
): Promise<Client> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.segment !== undefined) patch.segment = input.segment;
  if (input.location !== undefined) patch.location = input.location;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.draft_content !== undefined) patch.draft_content = input.draft_content;

  const { data, error } = await sb
    .from("clients")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo actualizar el cliente: ${error.message}`);
  return data as Client;
}

export async function archiveClient(id: string): Promise<Client> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("clients")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo archivar el cliente: ${error.message}`);
  return data as Client;
}

export async function restoreClient(id: string): Promise<Client> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("clients")
    .update({ archived_at: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo restaurar el cliente: ${error.message}`);
  return data as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const sb = getSupabase();
  // Hard delete; versions cascade via the FK in the schema.
  const { error } = await sb.from("clients").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el cliente: ${error.message}`);
}

/**
 * Data access for versions.
 *
 * Versioning rules (see docs/ARCHITECTURE.md):
 * - version_number is text "vMAJOR.MINOR".
 * - minor bump: vX.Y → vX.(Y+1); rolls over to v(X+1).0 at .9.
 * - major bump: vX.Y → v(X+1).0, marks this version production (unmarks
 *   others). Kept for the API/old rows; no UI triggers it anymore —
 *   production promotion is mark-only via promoteToProduction().
 * - imported: uses an explicit version number, marks production + flags the
 *   client as legacy.
 * - Max 5 versions/client enforced by a DB trigger; the 6th insert deletes the
 *   oldest non-production version. The insert still returns the new row.
 */
import { getSupabase } from "../supabase";
import { computeNextNumber, syncVersionMarkers, type BumpType } from "../version-utils";

export type { BumpType };
export type VersionSource = "manual" | "editor_chat" | "creator_chat" | "imported";

export type VersionSummary = {
  id: string;
  client_id: string;
  version_number: string;
  is_production: boolean;
  bump_type: BumpType | null;
  source: VersionSource | null;
  source_session_id: string | null;
  /** Editor's "CAMBIOS REALIZADOS" prose, when this version came from an
   *  Editor chat; null for manual edits, imports, and first versions. */
  change_summary: string | null;
  created_at: string;
};

export type VersionListItem = VersionSummary & { content?: string };
export type Version = VersionSummary & { content: string };

const SUMMARY_COLS =
  "id, client_id, version_number, is_production, bump_type, source, source_session_id, change_summary, created_at";

export async function listVersions(
  clientId: string,
  options: { includeContent?: boolean } = {},
): Promise<VersionListItem[]> {
  const sb = getSupabase();
  const cols = options.includeContent ? `${SUMMARY_COLS}, content` : SUMMARY_COLS;
  const { data, error } = await sb
    .from("versions")
    .select(cols)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron listar las versiones: ${error.message}`);
  return (data ?? []) as unknown as VersionListItem[];
}

export async function getVersion(id: string): Promise<Version | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("versions")
    .select(`${SUMMARY_COLS}, content`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener la versión: ${error.message}`);
  return (data as Version | null) ?? null;
}

/** The client's most recently created version number, or null if none. Used
 *  by the Editor to preview the next version in the working draft. */
export async function getLatestVersionNumber(clientId: string): Promise<string | null> {
  return latestVersionNumber(clientId);
}

async function latestVersionNumber(clientId: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("versions")
    .select("version_number")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo calcular la versión: ${error.message}`);
  return (data?.version_number as string | undefined) ?? null;
}

async function unmarkProduction(clientId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("versions")
    .update({ is_production: false })
    .eq("client_id", clientId)
    .eq("is_production", true);
  if (error) throw new Error(`No se pudo actualizar la versión de producción: ${error.message}`);
}

export async function createVersion(
  clientId: string,
  content: string,
  options: {
    bumpType: BumpType;
    source: VersionSource;
    sourceSessionId?: string | null;
    versionNumberOverride?: string;
    changeSummary?: string | null;
  },
): Promise<Version> {
  const sb = getSupabase();
  const { bumpType, source, sourceSessionId, versionNumberOverride, changeSummary } = options;

  const latest = await latestVersionNumber(clientId);
  // An explicit override wins for any bump type (manual finalize can set the
  // number); otherwise it's auto-computed. Imported without an override still
  // throws inside computeNextNumber, so that requirement is preserved.
  const versionNumber = versionNumberOverride ?? computeNextNumber(latest, bumpType);
  const isProduction = bumpType === "major" || bumpType === "imported";

  // Only one production version per client (unique partial index): clear the
  // current one before inserting a new production version.
  if (isProduction) await unmarkProduction(clientId);

  // Keep the prompt's own version markers (title token + closing footer) in
  // sync with what's actually being saved: deterministic, never the model.
  const syncedContent = syncVersionMarkers(content, versionNumber);

  const { data, error } = await sb
    .from("versions")
    .insert({
      client_id: clientId,
      version_number: versionNumber,
      content: syncedContent,
      is_production: isProduction,
      bump_type: bumpType,
      source,
      source_session_id: sourceSessionId ?? null,
      change_summary: changeSummary ?? null,
    })
    .select(`${SUMMARY_COLS}, content`)
    .single();
  if (error) throw new Error(`No se pudo crear la versión: ${error.message}`);

  // Imported versions come from a production n8n flow → flag the client legacy.
  if (bumpType === "imported") {
    const { error: cErr } = await sb
      .from("clients")
      .update({ is_legacy: true })
      .eq("id", clientId);
    if (cErr) throw new Error(`No se pudo marcar el cliente como legacy: ${cErr.message}`);
  }

  return data as Version;
}

/**
 * Renames a version (manual override, e.g. the prompt was updated outside the
 * app during beta). Re-syncs the content's version markers to the new number
 * so the title token and footer stay consistent. Does not touch the
 * production flag or create a new row.
 */
export async function updateVersionNumber(id: string, versionNumber: string): Promise<Version> {
  const sb = getSupabase();
  const { data: current, error: gErr } = await sb
    .from("versions")
    .select("content")
    .eq("id", id)
    .single();
  if (gErr) throw new Error(`No se pudo obtener la versión: ${gErr.message}`);

  const syncedContent = syncVersionMarkers(current.content as string, versionNumber);
  const { data, error } = await sb
    .from("versions")
    .update({ version_number: versionNumber, content: syncedContent })
    .eq("id", id)
    .select(`${SUMMARY_COLS}, content`)
    .single();
  if (error) throw new Error(`No se pudo cambiar el número de versión: ${error.message}`);
  return data as Version;
}

/** Updates a version's change summary (add it after a quick save, or edit it).
 *  Pass null to clear it. Content is immutable except when the version number
 *  changes (which re-syncs the markers); only the human-facing note and the
 *  number itself change after the fact. */
export async function updateVersionSummary(
  id: string,
  summary: string | null,
): Promise<Version> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("versions")
    .update({ change_summary: summary })
    .eq("id", id)
    .select(`${SUMMARY_COLS}, content`)
    .single();
  if (error) throw new Error(`No se pudo guardar el resumen de cambios: ${error.message}`);
  return data as Version;
}

/**
 * Hard-deletes a single version. Callers must enforce the business rules
 * (don't delete the production version or a client's only version). FKs that
 * point at this version (chat_sessions.base_version_id / final_version_id,
 * runs.version_id) are ON DELETE SET NULL, so this never cascades.
 */
export async function deleteVersion(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("versions").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar la versión: ${error.message}`);
}

export async function promoteToProduction(versionId: string): Promise<Version> {
  const sb = getSupabase();
  const { data: target, error: tErr } = await sb
    .from("versions")
    .select("client_id")
    .eq("id", versionId)
    .single();
  if (tErr) throw new Error(`No se pudo obtener la versión: ${tErr.message}`);

  await unmarkProduction(target.client_id as string);

  const { data, error } = await sb
    .from("versions")
    .update({ is_production: true })
    .eq("id", versionId)
    .select(`${SUMMARY_COLS}, content`)
    .single();
  if (error) throw new Error(`No se pudo promover la versión: ${error.message}`);
  return data as Version;
}

/**
 * Data access for role defaults — which provider/model each of the 5 roles
 * uses (test_bot, adversarial_lead, judge, editor, creator).
 *
 * The role_defaults table starts empty (no seed); rows appear as the user
 * assigns roles in Settings. listRoleDefaults returns whatever exists, with
 * the provider name resolved via join.
 */
import { getSupabase } from "../supabase";

export type RoleName = "test_bot" | "adversarial_lead" | "judge" | "editor" | "creator";

export const ROLE_NAMES: RoleName[] = [
  "test_bot",
  "adversarial_lead",
  "judge",
  "editor",
  "creator",
];

export type RoleDefault = {
  role: RoleName;
  provider_id: string;
  provider_name: string | null;
  model_name: string;
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
  updated_at: string;
};

const SELECT =
  "role, provider_id, model_name, temperature, top_p, max_tokens, updated_at, providers(name)";

function flatten(row: any): RoleDefault {
  // Supabase returns the joined provider as an object (or array, depending on
  // the relationship inference). Handle both shapes defensively.
  const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers;
  return {
    role: row.role,
    provider_id: row.provider_id,
    provider_name: provider?.name ?? null,
    model_name: row.model_name,
    temperature: row.temperature,
    top_p: row.top_p,
    max_tokens: row.max_tokens,
    updated_at: row.updated_at,
  };
}

export async function listRoleDefaults(): Promise<RoleDefault[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("role_defaults").select(SELECT);
  if (error) throw new Error(`No se pudieron listar las asignaciones de roles: ${error.message}`);
  return (data ?? []).map(flatten);
}

export async function getRoleDefault(role: RoleName): Promise<RoleDefault | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("role_defaults")
    .select(SELECT)
    .eq("role", role)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener la asignación del rol: ${error.message}`);
  return data ? flatten(data) : null;
}

export async function setRoleDefault(
  role: RoleName,
  input: {
    provider_id: string;
    model_name: string;
    temperature?: number | null;
    top_p?: number | null;
    max_tokens?: number | null;
  },
): Promise<RoleDefault> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {
    role,
    provider_id: input.provider_id,
    model_name: input.model_name,
  };
  // Only send optional numeric fields when provided, so DB defaults apply on
  // insert and unspecified fields stay untouched on update.
  if (input.temperature !== undefined) row.temperature = input.temperature;
  if (input.top_p !== undefined) row.top_p = input.top_p;
  if (input.max_tokens !== undefined) row.max_tokens = input.max_tokens;

  const { data, error } = await sb
    .from("role_defaults")
    .upsert(row, { onConflict: "role" })
    .select(SELECT)
    .single();
  if (error) throw new Error(`No se pudo guardar la asignación del rol: ${error.message}`);
  return flatten(data);
}

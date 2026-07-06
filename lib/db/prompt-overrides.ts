/**
 * Data access for editable system prompts (see 006_create_prompt_overrides.sql).
 *
 * Each of the three personas (Editor, Creator, Adversarial judge) ships as a
 * code constant. A row here overrides that constant at runtime; no row means
 * the code default is used. The runtime reads via getPromptOverride() and the
 * build* helpers fall back to their constant when it returns null.
 */
import { getSupabase } from "../supabase";

export type PromptRole = "editor" | "creator" | "judge";
export const PROMPT_ROLES: PromptRole[] = ["editor", "creator", "judge"];

export type PromptOverride = {
  role: PromptRole;
  content: string;
  updated_at: string;
};

export async function listPromptOverrides(): Promise<PromptOverride[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("prompt_overrides")
    .select("role, content, updated_at");
  if (error) throw new Error(`No se pudieron listar los system prompts: ${error.message}`);
  return (data ?? []) as PromptOverride[];
}

/** The overriding content for a role, or null when it uses the code default. */
export async function getPromptOverride(role: PromptRole): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("prompt_overrides")
    .select("content")
    .eq("role", role)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener el system prompt: ${error.message}`);
  return (data?.content as string | undefined) ?? null;
}

export async function setPromptOverride(
  role: PromptRole,
  content: string,
): Promise<PromptOverride> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("prompt_overrides")
    .upsert({ role, content }, { onConflict: "role" })
    .select("role, content, updated_at")
    .single();
  if (error) throw new Error(`No se pudo guardar el system prompt: ${error.message}`);
  return data as PromptOverride;
}

/** Removes the override so the role reverts to its code default. */
export async function deletePromptOverride(role: PromptRole): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("prompt_overrides").delete().eq("role", role);
  if (error) throw new Error(`No se pudo restaurar el system prompt: ${error.message}`);
}

/**
 * Data access for Smart Paste's shared settings (Sprint 15).
 *
 * A single shared row for the whole team, not per-user: this app has no
 * per-user accounts (see CLAUDE.md, "No per-user separation"). `getSupabase`
 * always targets the singleton row (`id = true`), seeded by migration 016.
 */
import { getSupabase } from "../supabase";

export type ComposerSettings = {
  smart_paste_enabled: boolean;
  smart_paste_threshold: number;
};

const COLS = "smart_paste_enabled, smart_paste_threshold";

/** Code-level fallback, only used if the seeded row is ever missing. */
const DEFAULTS: ComposerSettings = {
  smart_paste_enabled: true,
  smart_paste_threshold: 1000,
};

export async function getComposerSettings(): Promise<ComposerSettings> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("composer_settings")
    .select(COLS)
    .eq("id", true)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo obtener la configuración de composición: ${error.message}`);
  }
  return (data as ComposerSettings | null) ?? DEFAULTS;
}

export async function updateComposerSettings(input: {
  smart_paste_enabled?: boolean;
  smart_paste_threshold?: number;
}): Promise<ComposerSettings> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {};
  if (input.smart_paste_enabled !== undefined) patch.smart_paste_enabled = input.smart_paste_enabled;
  if (input.smart_paste_threshold !== undefined) patch.smart_paste_threshold = input.smart_paste_threshold;

  const { data, error } = await sb
    .from("composer_settings")
    .update(patch)
    .eq("id", true)
    .select(COLS)
    .single();
  if (error) {
    throw new Error(`No se pudo actualizar la configuración de composición: ${error.message}`);
  }
  return data as ComposerSettings;
}

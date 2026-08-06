/**
 * Which Google Chat space gets a client's reports.
 *
 * Singleton row, like `composer-settings.ts`: no per-user accounts in this app,
 * so it is one shared choice for the team. The credentials are NOT here, they
 * are env vars (see lib/google-chat/auth.ts); this row holds a preference, not
 * a secret.
 */
import { getSupabase } from "../supabase";

export type GoogleChatSettings = {
  /** "spaces/AAAA…". Null means nobody picked one, so nothing is sent. */
  space_name: string | null;
  space_display_name: string | null;
  updated_at: string | null;
};

const COLS = "space_name, space_display_name, updated_at";

const DEFAULTS: GoogleChatSettings = {
  space_name: null,
  space_display_name: null,
  updated_at: null,
};

/** Falls back to "off" rather than throwing: a missing row must never be able
 *  to break the client's report, which is what calls this. */
export async function getGoogleChatSettings(): Promise<GoogleChatSettings> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("google_chat_settings")
    .select(COLS)
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la configuración de Google Chat: ${error.message}`);
  return (data as unknown as GoogleChatSettings) ?? DEFAULTS;
}

export async function updateGoogleChatSettings(patch: {
  spaceName: string | null;
  spaceDisplayName: string | null;
}): Promise<GoogleChatSettings> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("google_chat_settings")
    .update({ space_name: patch.spaceName, space_display_name: patch.spaceDisplayName })
    .eq("id", true)
    .select(COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el espacio de Google Chat: ${error.message}`);
  return data as unknown as GoogleChatSettings;
}

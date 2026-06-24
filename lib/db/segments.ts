/**
 * Data access for saved segment presets (the chips in the segment picker).
 * Free-text segments still live on `clients.segment`; this table only holds
 * the reusable presets. Names are unique case-insensitively (DB index).
 */
import { getSupabase } from "../supabase";

export type Segment = {
  id: string;
  name: string;
  created_at: string;
};

export async function listSegments(): Promise<Segment[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("segments")
    .select("id, name, created_at")
    .order("name", { ascending: true });
  if (error) throw new Error(`No se pudieron listar los segmentos: ${error.message}`);
  return (data ?? []) as Segment[];
}

/**
 * Saves a preset. Idempotent on name (case-insensitive): if it already exists,
 * the existing row is returned instead of erroring.
 */
export async function createSegment(name: string): Promise<Segment> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("segments")
    .insert({ name })
    .select("id, name, created_at")
    .single();

  if (error) {
    // 23505 = unique_violation → the preset already exists; return it.
    if ((error as { code?: string }).code === "23505") {
      const { data: existing, error: selErr } = await sb
        .from("segments")
        .select("id, name, created_at")
        .ilike("name", name)
        .maybeSingle();
      if (selErr) throw new Error(`No se pudo guardar el segmento: ${selErr.message}`);
      if (existing) return existing as Segment;
    }
    throw new Error(`No se pudo guardar el segmento: ${error.message}`);
  }
  return data as Segment;
}

/**
 * Data access for the n8n sync audit log. Each row records a push, a manual
 * confirmation, a drift detection or a rollback, and (for pushes) keeps the
 * previous node text so a push can be reverted. See docs/N8N-SYNC-PLAN.md 7.
 */
import { getSupabase } from "../supabase";

export type SyncAction = "push" | "rollback" | "drift_detected" | "manual_confirm";
export type SyncStatus = "success" | "error";

export type SyncEvent = {
  id: string;
  binding_id: string | null;
  client_id: string | null;
  version_id: string | null;
  action: SyncAction;
  status: SyncStatus;
  previous_content: string | null;
  pushed_content: string | null;
  error_message: string | null;
  created_at: string;
};

export async function logSyncEvent(input: {
  binding_id: string | null;
  client_id: string | null;
  version_id: string | null;
  action: SyncAction;
  status: SyncStatus;
  previous_content?: string | null;
  pushed_content?: string | null;
  error_message?: string | null;
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("n8n_sync_events").insert({
    binding_id: input.binding_id,
    client_id: input.client_id,
    version_id: input.version_id,
    action: input.action,
    status: input.status,
    previous_content: input.previous_content ?? null,
    pushed_content: input.pushed_content ?? null,
    error_message: input.error_message ?? null,
  });
  // Logging must never break the actual operation; swallow but report.
  if (error) console.error(`No se pudo registrar el evento de sync n8n: ${error.message}`);
}

export async function listSyncEvents(clientId: string, limit = 50): Promise<SyncEvent[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("n8n_sync_events")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`No se pudo obtener el historial de sync: ${error.message}`);
  return (data ?? []) as SyncEvent[];
}

/**
 * Data access for adversarial-lab runs (Sprint 4).
 *
 * A run pits the bot under test (the selected version's prompt) against an
 * adversarial lead persona, then a judge reports on the transcript. To keep a
 * run reproducible and let reports outlive version deletion, `createRun`
 * snapshots the prompt + version number into the run row and captures the
 * resolved model config for each role (bot/lead/judge) into the *_config jsonb
 * columns. The conversation lands in `run_messages`, the verdict in `reports`.
 */
import { getSupabase } from "../supabase";
import { getVersion } from "./versions";
import { getRoleDefault, type RoleName } from "./role-defaults";
import type { Preset, Intensity } from "../prompts/adversarial-personas";
import type { JudgeReport } from "../prompts/judge";

export type RunStatus = "pending" | "running" | "completed" | "stopped" | "error";
export type RunMessageRole = "bot" | "lead";
export type RunStarter = "bot" | "lead";

/** Snapshot of the model settings a role ran with (stored in *_config). */
export type RunModelConfig = {
  provider_id: string;
  model_name: string;
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
};

export type Run = {
  id: string;
  client_id: string;
  version_id: string | null;
  version_number_snapshot: string;
  prompt_snapshot: string;
  preset: Preset;
  intensity: Intensity;
  max_turns: number;
  starter: RunStarter;
  lead_brief: string | null;
  bot_config: RunModelConfig;
  lead_config: RunModelConfig;
  judge_config: RunModelConfig;
  status: RunStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type RunMessageRow = {
  id: string;
  run_id: string;
  turn_number: number;
  role: RunMessageRole;
  content: string;
  created_at: string;
};

export type ReportRow = {
  id: string;
  run_id: string;
  summary: string;
  findings: JudgeReport["findings"];
  edge_cases: string[];
  scope_disclaimer: string | null;
  created_at: string;
};

export type RunListItem = Run & { client_name: string | null };
export type RunDetail = RunListItem & {
  messages: RunMessageRow[];
  report: ReportRow | null;
};

const RUN_COLS =
  "id, client_id, version_id, version_number_snapshot, prompt_snapshot, preset, " +
  "intensity, max_turns, starter, lead_brief, bot_config, lead_config, judge_config, status, " +
  "error_message, created_at, completed_at";

const MESSAGE_COLS = "id, run_id, turn_number, role, content, created_at";
const REPORT_COLS = "id, run_id, summary, findings, edge_cases, scope_disclaimer, created_at";

const TERMINAL: RunStatus[] = ["completed", "stopped", "error"];

const ROLE_LABEL: Record<"test_bot" | "adversarial_lead" | "judge", string> = {
  test_bot: "Bot de prueba",
  adversarial_lead: "Lead adversarial",
  judge: "Juez",
};

function flattenListItem(row: any): RunListItem {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const { clients: _omit, ...run } = row;
  return { ...(run as Run), client_name: client?.name ?? null };
}

/** Thrown when a required role has no model assigned (maps to HTTP 400). */
export class RoleNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleNotConfiguredError";
  }
}

/** Resolves a role's assigned model into a config snapshot, or throws. */
async function resolveConfig(role: RoleName): Promise<RunModelConfig> {
  const rd = await getRoleDefault(role);
  if (!rd) {
    const label = ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role;
    throw new RoleNotConfiguredError(
      `No hay un modelo asignado al rol ${label}. Configúralo en Configuración.`,
    );
  }
  return {
    provider_id: rd.provider_id,
    model_name: rd.model_name,
    temperature: rd.temperature,
    top_p: rd.top_p,
    max_tokens: rd.max_tokens,
  };
}

export async function createRun(input: {
  clientId: string;
  versionId: string;
  preset: Preset;
  intensity: Intensity;
  maxTurns?: number;
  starter?: RunStarter;
  leadBrief?: string;
}): Promise<Run> {
  const version = await getVersion(input.versionId);
  if (!version) throw new Error("La versión a probar no existe.");
  if (version.client_id !== input.clientId) {
    throw new Error("La versión no pertenece al cliente indicado.");
  }

  // Capture the production-fidelity config for each role up front.
  const [bot_config, lead_config, judge_config] = await Promise.all([
    resolveConfig("test_bot"),
    resolveConfig("adversarial_lead"),
    resolveConfig("judge"),
  ]);

  const sb = getSupabase();
  const row: Record<string, unknown> = {
    client_id: input.clientId,
    version_id: input.versionId,
    version_number_snapshot: version.version_number,
    prompt_snapshot: version.content,
    preset: input.preset,
    intensity: input.intensity,
    bot_config,
    lead_config,
    judge_config,
    status: "pending",
  };
  if (input.maxTurns !== undefined) row.max_turns = input.maxTurns;
  if (input.starter !== undefined) row.starter = input.starter;
  if (input.leadBrief) row.lead_brief = input.leadBrief;

  const { data, error } = await sb.from("runs").insert(row).select(RUN_COLS).single();
  if (error) throw new Error(`No se pudo crear la prueba: ${error.message}`);
  return data as unknown as Run;
}

export async function listRuns({ clientId }: { clientId?: string } = {}): Promise<RunListItem[]> {
  const sb = getSupabase();
  let query = sb.from("runs").select(`${RUN_COLS}, clients(name)`);
  if (clientId) query = query.eq("client_id", clientId);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron listar las pruebas: ${error.message}`);
  return (data ?? []).map(flattenListItem);
}

export async function getRun(id: string): Promise<RunDetail | null> {
  const sb = getSupabase();
  const { data: run, error } = await sb
    .from("runs")
    .select(`${RUN_COLS}, clients(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo obtener la prueba: ${error.message}`);
  if (!run) return null;

  const { data: messages, error: mErr } = await sb
    .from("run_messages")
    .select(MESSAGE_COLS)
    .eq("run_id", id)
    .order("turn_number", { ascending: true });
  if (mErr) throw new Error(`No se pudieron obtener los mensajes: ${mErr.message}`);

  const { data: report, error: rErr } = await sb
    .from("reports")
    .select(REPORT_COLS)
    .eq("run_id", id)
    .maybeSingle();
  if (rErr) throw new Error(`No se pudo obtener el reporte: ${rErr.message}`);

  return {
    ...flattenListItem(run),
    messages: (messages ?? []) as unknown as RunMessageRow[],
    report: (report as ReportRow | null) ?? null,
  };
}

export async function appendRunMessage(
  runId: string,
  input: { turnNumber: number; role: RunMessageRole; content: string },
): Promise<RunMessageRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("run_messages")
    .insert({
      run_id: runId,
      turn_number: input.turnNumber,
      role: input.role,
      content: input.content,
    })
    .select(MESSAGE_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el turno: ${error.message}`);
  return data as unknown as RunMessageRow;
}

/** Writes (or replaces) the run's judge report. One report per run. */
export async function saveReport(runId: string, report: JudgeReport): Promise<ReportRow> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("reports")
    .upsert(
      {
        run_id: runId,
        summary: report.summary,
        findings: report.findings,
        edge_cases: report.edge_cases,
        scope_disclaimer: report.scope_disclaimer ?? null,
      },
      { onConflict: "run_id" },
    )
    .select(REPORT_COLS)
    .single();
  if (error) throw new Error(`No se pudo guardar el reporte: ${error.message}`);
  return data as unknown as ReportRow;
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  errorMessage?: string | null,
): Promise<Run> {
  const sb = getSupabase();
  const update: Record<string, unknown> = { status, error_message: errorMessage ?? null };
  // Stamp the completion time once the run reaches a terminal state.
  if (TERMINAL.includes(status)) update.completed_at = new Date().toISOString();

  const { data, error } = await sb
    .from("runs")
    .update(update)
    .eq("id", runId)
    .select(RUN_COLS)
    .single();
  if (error) throw new Error(`No se pudo actualizar la prueba: ${error.message}`);
  return data as unknown as Run;
}

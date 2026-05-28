// Model catalogs and role defaults (SPEC §2, §6).
// These are the configurable options surfaced in the Settings screen.
// Defaults mirror what we run in production today.

export type Provider = "openai" | "anthropic";

export type RoleId = "tested_bot" | "adversarial_lead" | "judge";

export interface ModelOption {
  id: string;
  label: string;
}

// OpenAI models — used by the chatbot under test (must mirror production).
export const OPENAI_MODELS: ModelOption[] = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
];

// Anthropic models — used by the adversarial lead and the judge.
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export interface RoleConfig {
  model: string;
  temperature: number;
  top_p: number;
}

export interface ModelSettings {
  tested_bot: RoleConfig;
  adversarial_lead: RoleConfig;
  judge: RoleConfig;
}

// Initial defaults per SPEC §2 (the "production mirror" values).
export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  tested_bot: { model: "gpt-4.1-mini", temperature: 0.7, top_p: 1 },
  adversarial_lead: { model: "claude-sonnet-4-6", temperature: 1.0, top_p: 1 },
  judge: { model: "claude-sonnet-4-6", temperature: 0.2, top_p: 1 },
};

export const ROLE_META: Record<RoleId, { label: string; provider: Provider }> = {
  tested_bot: { label: "Chatbot bajo prueba", provider: "openai" },
  adversarial_lead: { label: "Lead adversarial", provider: "anthropic" },
  judge: { label: "Juez / evaluador", provider: "anthropic" },
};

// Merge a partial (possibly malformed) settings object onto the defaults,
// keeping numeric fields in valid ranges. Used when reading from disk.
export function normalizeModelSettings(input: unknown): ModelSettings {
  const base: ModelSettings = JSON.parse(JSON.stringify(DEFAULT_MODEL_SETTINGS));
  if (!input || typeof input !== "object") return base;
  const obj = input as Record<string, unknown>;
  for (const role of Object.keys(base) as RoleId[]) {
    const incoming = obj[role];
    if (!incoming || typeof incoming !== "object") continue;
    const r = incoming as Record<string, unknown>;
    if (typeof r.model === "string" && r.model.trim()) {
      base[role].model = r.model;
    }
    if (typeof r.temperature === "number" && Number.isFinite(r.temperature)) {
      base[role].temperature = clamp(r.temperature, 0, 2);
    }
    if (typeof r.top_p === "number" && Number.isFinite(r.top_p)) {
      base[role].top_p = clamp(r.top_p, 0, 1);
    }
  }
  return base;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Preloaded model suggestions per adapter type.
 *
 * These power the model dropdown in Settings → role assignments and the
 * "add model" datalist in the provider list, so the team can pick a known
 * model instead of remembering its exact ID. They are suggestions only — the
 * source of truth for what a provider exposes is still the `provider_models`
 * table; an admin can always type a custom model name.
 *
 * Keep these in sync with the current generation of each vendor when models
 * roll over. IDs must match what the corresponding API expects.
 */
import type { AdapterType } from "@/lib/db/providers";

export type CatalogModel = {
  model_name: string;
  display_name: string;
};

export const MODEL_CATALOG: Record<AdapterType, CatalogModel[]> = {
  anthropic: [
    { model_name: "claude-opus-4-8", display_name: "Claude Opus 4.8" },
    { model_name: "claude-opus-4-7", display_name: "Claude Opus 4.7" },
    { model_name: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
    { model_name: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
  ],
  openai_compat: [
    { model_name: "gpt-4o", display_name: "GPT-4o" },
    { model_name: "gpt-4o-mini", display_name: "GPT-4o mini" },
    { model_name: "gpt-4.1", display_name: "GPT-4.1" },
    { model_name: "gpt-4.1-mini", display_name: "GPT-4.1 mini" },
    { model_name: "o3", display_name: "o3" },
    { model_name: "o4-mini", display_name: "o4-mini" },
  ],
  google: [
    { model_name: "gemini-2.5-pro", display_name: "Gemini 2.5 Pro" },
    { model_name: "gemini-2.5-flash", display_name: "Gemini 2.5 Flash" },
    { model_name: "gemini-2.0-flash", display_name: "Gemini 2.0 Flash" },
  ],
  openrouter: [
    { model_name: "anthropic/claude-opus-4-8", display_name: "Claude Opus 4.8" },
    { model_name: "anthropic/claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
    { model_name: "openai/gpt-4o", display_name: "GPT-4o" },
    { model_name: "google/gemini-2.5-pro", display_name: "Gemini 2.5 Pro" },
  ],
};

export function catalogFor(adapterType: AdapterType): CatalogModel[] {
  return MODEL_CATALOG[adapterType] ?? [];
}

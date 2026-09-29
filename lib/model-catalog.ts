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
    { model_name: "claude-fable-5-1", display_name: "Claude Fable 5.1" },
    { model_name: "claude-opus-5-5", display_name: "Claude Opus 5.5" },
    { model_name: "claude-opus-5", display_name: "Claude Opus 5" },
    { model_name: "claude-sonnet-5", display_name: "Claude Sonnet 5" },
    { model_name: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
  ],
  openai_compat: [
    { model_name: "gpt-6-astra", display_name: "GPT-6 Astra" },
    { model_name: "gpt-6.1-sol", display_name: "GPT-6.1 Sol" },
    { model_name: "gpt-6-luna", display_name: "GPT-6 Luna" },
    { model_name: "gpt-5.5", display_name: "GPT-5.5" },
    { model_name: "gpt-5.4-mini", display_name: "GPT-5.4 mini" },
    { model_name: "gpt-5.4-nano", display_name: "GPT-5.4 nano" },
    // Production chatbots still run these; the chatbot under test must mirror prod.
    { model_name: "gpt-4.1", display_name: "GPT-4.1" },
    { model_name: "gpt-4.1-mini", display_name: "GPT-4.1 mini" },
  ],
  google: [
    { model_name: "gemini-2.5-pro", display_name: "Gemini 2.5 Pro" },
    { model_name: "gemini-2.5-flash", display_name: "Gemini 2.5 Flash" },
    { model_name: "gemini-2.0-flash", display_name: "Gemini 2.0 Flash" },
  ],
  openrouter: [
    { model_name: "anthropic/claude-opus-5", display_name: "Claude Opus 5" },
    { model_name: "anthropic/claude-sonnet-5", display_name: "Claude Sonnet 5" },
    { model_name: "openai/gpt-4o", display_name: "GPT-4o" },
    { model_name: "google/gemini-2.5-pro", display_name: "Gemini 2.5 Pro" },
  ],
};

export function catalogFor(adapterType: AdapterType): CatalogModel[] {
  return MODEL_CATALOG[adapterType] ?? [];
}

// Secure API key handling — BACKEND ONLY (SPEC §6).
//
// Non-negotiable rules enforced here:
//  - Keys live only on the backend. They never cross to the frontend.
//  - Resolution priority: env var > .secrets/keys.json (env always wins).
//  - The frontend only ever receives a MASKED version (e.g. "sk-...4f2a").
//  - The local file lives outside Git (.gitignore) with 0600 perms, dir 0700.
//  - If a key comes from an env var, the UI cannot overwrite it.
//
// This module imports node:fs and must only be used from server code
// (API routes / server components). Never import it into a client component.

import "server-only";
import fs from "node:fs";
import { keysFilePath, secretsDir } from "./paths";
import { normalizeModelSettings, ModelSettings } from "./models";

export type Provider = "openai" | "anthropic";
export type KeySource = "env" | "file" | "unset";

// Shape persisted to .secrets/keys.json
interface StoredKeys {
  openaiKey?: string;
  anthropicKey?: string;
  models?: ModelSettings;
}

// What we expose to the frontend per provider — never the raw key.
export interface KeyStatus {
  configured: boolean;
  masked: string | null;
  source: KeySource;
  // When true the value comes from an env var and the UI must not overwrite it.
  locked: boolean;
}

export interface PublicSettings {
  openai: KeyStatus;
  anthropic: KeyStatus;
  models: ModelSettings;
}

const ENV_VARS: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

// ---- file I/O ----

function readStored(): StoredKeys {
  try {
    const raw = fs.readFileSync(keysFilePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredKeys;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Missing file (the normal case in production) or unreadable -> empty.
    return {};
  }
}

function writeStored(data: StoredKeys): void {
  const dir = secretsDir();
  // Restrictive perms: dir 0700, file 0600. Best-effort on non-POSIX FS.
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = keysFilePath();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
    fs.chmodSync(dir, 0o700);
  } catch {
    // chmod may fail on some filesystems; perms set at creation are best-effort.
  }
}

// ---- masking ----

// Show only enough to recognize the key: a short prefix + last 4 chars.
// Examples: "sk-proj-...4f2a", short keys fall back to "****".
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "****";
  const last4 = k.slice(-4);
  const dashIdx = k.indexOf("-");
  const prefix =
    dashIdx > 0 && dashIdx <= 8 ? k.slice(0, dashIdx + 1) : k.slice(0, 3);
  return `${prefix}...${last4}`;
}

// ---- resolution (env wins) ----

function envValue(provider: Provider): string | undefined {
  const v = process.env[ENV_VARS[provider]];
  const trimmed = v?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

// The effective key actually used to call the provider's API.
// Used by backend conversation/judge routes in later phases.
export function getEffectiveKey(provider: Provider): string | null {
  const env = envValue(provider);
  if (env) return env;
  const stored = readStored();
  const fileKey = provider === "openai" ? stored.openaiKey : stored.anthropicKey;
  const trimmed = fileKey?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function statusFor(provider: Provider, stored: StoredKeys): KeyStatus {
  const env = envValue(provider);
  if (env) {
    return { configured: true, masked: maskKey(env), source: "env", locked: true };
  }
  const fileKey = provider === "openai" ? stored.openaiKey : stored.anthropicKey;
  const trimmed = fileKey?.trim();
  if (trimmed && trimmed.length > 0) {
    return {
      configured: true,
      masked: maskKey(trimmed),
      source: "file",
      locked: false,
    };
  }
  return { configured: false, masked: null, source: "unset", locked: false };
}

// Everything the Settings screen needs — fully masked, safe for the frontend.
export function getPublicSettings(): PublicSettings {
  const stored = readStored();
  return {
    openai: statusFor("openai", stored),
    anthropic: statusFor("anthropic", stored),
    models: normalizeModelSettings(stored.models),
  };
}

export interface UpdateInput {
  // Raw keys submitted from the UI. Empty/undefined = leave unchanged.
  // Ignored entirely for providers locked by an env var.
  openaiKey?: string;
  anthropicKey?: string;
  models?: unknown;
}

// Persist updates to the local file (dev only). Returns the new public
// (masked) settings. Keys provided for env-locked providers are rejected.
export function updateSettings(input: UpdateInput): {
  settings: PublicSettings;
  ignored: Provider[];
} {
  const stored = readStored();
  const ignored: Provider[] = [];

  applyKeyUpdate("openai", input.openaiKey, stored, ignored);
  applyKeyUpdate("anthropic", input.anthropicKey, stored, ignored);

  if (input.models !== undefined) {
    stored.models = normalizeModelSettings(input.models);
  }

  writeStored(stored);
  return { settings: getPublicSettings(), ignored };
}

function applyKeyUpdate(
  provider: Provider,
  raw: string | undefined,
  stored: StoredKeys,
  ignored: Provider[],
): void {
  if (raw === undefined) return; // field not submitted -> leave as-is
  const value = raw.trim();

  // Env-locked providers can never be written from the UI.
  if (envValue(provider)) {
    if (value.length > 0) ignored.push(provider);
    return;
  }

  const field = provider === "openai" ? "openaiKey" : "anthropicKey";
  if (value.length === 0) {
    // Explicit empty string clears the stored key.
    delete stored[field];
  } else {
    stored[field] = value;
  }
}

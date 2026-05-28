import path from "node:path";

// Persistent data directory (SPEC §7, §14). Configurable via env so the same
// code works locally (./data) and in production (/data on a mounted volume).
export function dataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  return fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "data");
}

// Local secrets directory — dev-only key storage, always outside Git (§6).
export function secretsDir(): string {
  return path.resolve(process.cwd(), ".secrets");
}

export function keysFilePath(): string {
  return path.join(secretsDir(), "keys.json");
}

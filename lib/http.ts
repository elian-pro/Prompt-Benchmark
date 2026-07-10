import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ProviderInUseError } from "./db/providers";
import { UnsupportedFileError } from "./db/uploads";
import { RoleNotConfiguredError } from "./db/runs";
import { ConnectionInUseError } from "./db/n8n-connections";
import { N8nApiError } from "./n8n/client";

/** JSON error envelope. Messages are in Spanish (user-facing). */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Maps thrown errors to the right HTTP status:
 * - ZodError               → 400 (validation)
 * - UnsupportedFileError    → 400 (validation)
 * - RoleNotConfiguredError  → 400 (validation)
 * - ProviderInUseError      → 409 (conflict)
 * - everything else         → 500 (internal)
 */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    const msg = err.errors.map((e) => e.message).join("; ");
    return jsonError(`Datos inválidos: ${msg}`, 400);
  }
  if (err instanceof UnsupportedFileError) {
    return jsonError(err.message, 400);
  }
  if (err instanceof RoleNotConfiguredError) {
    return jsonError(err.message, 400);
  }
  if (err instanceof ProviderInUseError) {
    return jsonError(err.message, 409);
  }
  if (err instanceof ConnectionInUseError) {
    return jsonError(err.message, 409);
  }
  if (err instanceof N8nApiError) {
    // 502: the failure is upstream in n8n, not in our request handling.
    return jsonError(err.message, 502);
  }
  if (err instanceof SyntaxError) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }
  const message = err instanceof Error ? err.message : "Error interno del servidor.";
  return jsonError(message, 500);
}

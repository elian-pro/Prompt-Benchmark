import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ProviderInUseError } from "./db/providers";
import { UnsupportedFileError, AttachmentUnavailableError } from "./db/uploads";
import { RoleNotConfiguredError } from "./db/runs";
import { ConnectionInUseError } from "./db/n8n-connections";
import { N8nApiError } from "./n8n/client";
import { ChatsAdminError } from "./chats-admin";
import { GoogleChatError } from "./google-chat/auth.ts";
import { VersionSwitchBlockedError, LinkSessionProtectedError } from "./db/demo-sessions";
import { DemoLinkError } from "./demo-link-guard";

/** JSON error envelope. Messages are in Spanish (user-facing). */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Maps thrown errors to the right HTTP status:
 * - ZodError                 → 400 (validation)
 * - UnsupportedFileError     → 400 (validation)
 * - AttachmentUnavailableError → 400 (validation)
 * - RoleNotConfiguredError   → 400 (validation)
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
  if (err instanceof AttachmentUnavailableError) {
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
  if (err instanceof VersionSwitchBlockedError) {
    return jsonError(err.message, 409);
  }
  if (err instanceof LinkSessionProtectedError) {
    return jsonError(err.message, 409);
  }
  if (err instanceof DemoLinkError) {
    // The guard on the public demo routes already decided the status: 404 for
    // an unknown token, 409 for a closed link or an exhausted cap, 429 when
    // the caller is going too fast.
    const res = jsonError(err.message, err.status);
    if (err.retryAfterSeconds) {
      res.headers.set("Retry-After", String(err.retryAfterSeconds));
    }
    return res;
  }
  if (err instanceof N8nApiError) {
    // 502: the failure is upstream in n8n, not in our request handling.
    return jsonError(err.message, 502);
  }
  if (err instanceof ChatsAdminError) {
    // 502 for the same reason: upstream is the Supabase Management API.
    return jsonError(err.message, 502);
  }
  if (err instanceof GoogleChatError) {
    // Same: the failure is Google's, and only the Settings card ever sees it.
    // The notification path swallows its own errors and never reaches here.
    return jsonError(err.message, 502);
  }
  if (err instanceof SyntaxError) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }
  const message = err instanceof Error ? err.message : "Error interno del servidor.";
  return jsonError(message, 500);
}

/**
 * Client-side helpers for Editor/Creator attachments — shared by the idle
 * composer, the in-conversation composer, and the FileUpload chip row so the
 * accepted-types list and the upload call live in one place.
 */
import type { Attachment } from "@/lib/db/chat-sessions";

/** `accept` attribute for the hidden file inputs (mirrors the server's allow-list). */
export const ATTACHMENT_ACCEPT =
  ".txt,.md,.markdown,.pdf,.png,.jpg,.jpeg,.webp,.gif,text/plain,text/markdown,application/pdf,image/*";

// Mirrors assertAllowed() in lib/db/uploads.ts — kept in sync so drops are
// filtered client-side with the same rule the server enforces.
const ALLOWED_MIME = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const ALLOWED_EXT = new Set(["txt", "md", "markdown", "pdf", "png", "jpg", "jpeg", "webp", "gif"]);

/** Whether a dropped/picked file is one the server will accept. */
export function isAcceptedFile(file: File): boolean {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  return ALLOWED_MIME.has(file.type) || ALLOWED_EXT.has(ext);
}

/** Uploads one file to a session and returns its attachment reference. Throws on failure. */
export async function uploadAttachment(sessionId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "No se pudo subir el archivo.");
  }
  const up = await res.json();
  return { uploadId: up.id, filename: up.filename, mimeType: up.mime_type };
}

/**
 * Data access for Editor/Creator file uploads.
 *
 * Files live in the private Supabase Storage bucket `studio-uploads`; the
 * `uploads` table tracks each one with `expires_at = created_at + 7 days`
 * (DB default). A daily pg_cron job only removes expired DB rows, so whenever
 * the app deletes an upload it must ALSO remove the Storage object — that
 * coupling lives in deleteUpload() (see docs/ARCHITECTURE.md, Uploads TTL).
 */
import { randomUUID } from "crypto";
import { getSupabase } from "../supabase";

export const BUCKET = "studio-uploads";

/** Sprint 2 accepts text, PDF, image and markdown (locked at planning). */
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

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type Upload = {
  id: string;
  session_id: string | null;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  expires_at: string;
  created_at: string;
};

const COLS =
  "id, session_id, filename, storage_path, mime_type, size_bytes, expires_at, created_at";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Validation error surfaced to the API as a 400. */
export class UnsupportedFileError extends Error {}

export function assertAllowed(filename: string, mimeType: string, size: number): void {
  const ext = extensionOf(filename);
  if (!ALLOWED_MIME.has(mimeType) && !ALLOWED_EXT.has(ext)) {
    throw new UnsupportedFileError(
      "Tipo de archivo no permitido. Acepta texto, PDF, imagen o markdown.",
    );
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw new UnsupportedFileError("El archivo supera el límite de 10 MB.");
  }
}

export async function createUpload(input: {
  sessionId: string;
  file: File;
}): Promise<Upload> {
  const { sessionId, file } = input;
  assertAllowed(file.name, file.type, file.size);

  const sb = getSupabase();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${sessionId}/${randomUUID()}-${safeName}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) throw new Error(`No se pudo subir el archivo: ${upErr.message}`);

  const { data, error } = await sb
    .from("uploads")
    .insert({
      session_id: sessionId,
      filename: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select(COLS)
    .single();
  if (error) {
    // Roll back the orphaned Storage object if the row insert failed.
    await sb.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`No se pudo registrar el archivo: ${error.message}`);
  }
  return data as unknown as Upload;
}

export async function getUpload(id: string): Promise<Upload | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("uploads").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo obtener el archivo: ${error.message}`);
  return (data as unknown as Upload | null) ?? null;
}

/** Downloads an upload's bytes from Storage (for feeding files to the model). */
export async function downloadUploadBytes(
  id: string,
): Promise<{ upload: Upload; bytes: Buffer } | null> {
  const upload = await getUpload(id);
  if (!upload) return null;
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(BUCKET).download(upload.storage_path);
  if (error) throw new Error(`No se pudo descargar el archivo: ${error.message}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  return { upload, bytes };
}

/** Deletes the DB row AND the Storage object (the cron only clears rows). */
export async function deleteUpload(id: string): Promise<void> {
  const sb = getSupabase();
  const upload = await getUpload(id);
  if (!upload) return;

  const { error: rmErr } = await sb.storage.from(BUCKET).remove([upload.storage_path]);
  if (rmErr) throw new Error(`No se pudo eliminar el archivo del almacenamiento: ${rmErr.message}`);

  const { error } = await sb.from("uploads").delete().eq("id", id);
  if (error) throw new Error(`No se pudo eliminar el registro del archivo: ${error.message}`);
}

import { NextRequest, NextResponse } from "next/server";
import { createUpload } from "@/lib/db/uploads";
import { getSession } from "@/lib/db/chat-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Duck-types a multipart form entry as a File without referencing the
 * global `File` constructor at runtime: Node < 20 doesn't expose it (it's
 * added in Node 20, see nodejs.org/api/globals.html#class-file), even
 * though its own fetch/formdata implementation still hands back a File-like
 * object. `instanceof File` there throws "File is not defined" before the
 * check even runs.
 */
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { size?: unknown }).size === "number"
  );
}

/** Uploads a file (multipart/form-data: `sessionId`, `file`) to Storage. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sessionId = form.get("sessionId");
    const file = form.get("file");

    if (typeof sessionId !== "string" || !sessionId) {
      return jsonError("Falta el identificador de la sesión.", 400);
    }
    if (!isUploadedFile(file)) {
      return jsonError("No se recibió ningún archivo.", 400);
    }
    const session = await getSession(sessionId);
    if (!session) return jsonError("Sesión no encontrada.", 404);

    const upload = await createUpload({ sessionId, file });
    return NextResponse.json(upload, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

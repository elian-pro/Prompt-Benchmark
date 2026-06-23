import { NextRequest, NextResponse } from "next/server";
import { createUpload } from "@/lib/db/uploads";
import { getSession } from "@/lib/db/chat-sessions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Uploads a file (multipart/form-data: `sessionId`, `file`) to Storage. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sessionId = form.get("sessionId");
    const file = form.get("file");

    if (typeof sessionId !== "string" || !sessionId) {
      return jsonError("Falta el identificador de la sesión.", 400);
    }
    if (!(file instanceof File)) {
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

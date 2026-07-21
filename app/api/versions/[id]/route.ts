import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getVersion,
  listVersions,
  deleteVersion,
  updateVersionSummary,
  updateVersionNumber,
} from "@/lib/db/versions";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const updateVersionSchema = z
  .object({
    changeSummary: z.string().max(280, "El resumen es demasiado largo (máx. 250).").nullable().optional(),
    versionNumber: z
      .string()
      .regex(/^v\d+\.\d+$/, "El número debe tener formato vX.Y (p. ej. v2.5).")
      .optional(),
  })
  .refine((v) => v.changeSummary !== undefined || v.versionNumber !== undefined, {
    message: "No se enviaron campos para actualizar.",
  });

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const version = await getVersion(id);
    if (!version) return jsonError("Versión no encontrada.", 404);
    return NextResponse.json(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const version = await getVersion(id);
    if (!version) return jsonError("Versión no encontrada.", 404);
    const input = updateVersionSchema.parse(await req.json());
    if (input.versionNumber !== undefined) {
      return NextResponse.json(await updateVersionNumber(id, input.versionNumber));
    }
    const trimmed = input.changeSummary?.trim() || null;
    return NextResponse.json(await updateVersionSummary(id, trimmed));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const version = await getVersion(id);
    if (!version) return jsonError("Versión no encontrada.", 404);
    if (version.is_production) {
      return jsonError(
        "No se puede eliminar la versión de producción. Promueve otra primero.",
        409,
      );
    }
    const siblings = await listVersions(version.client_id);
    if (siblings.length <= 1) {
      return jsonError("No se puede eliminar la única versión del cliente.", 409);
    }
    await deleteVersion(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

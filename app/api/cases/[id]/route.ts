import { NextRequest, NextResponse } from "next/server";
import {
  deleteCase,
  getCase,
  replayCutFor,
  setCaseResolution,
  updateCaseNote,
} from "@/lib/db/conversation-cases";
import { getVersion } from "@/lib/db/versions";
import { transcriptOf } from "@/lib/conversation-turns";
import { resolveCaseSchema, updateCaseSchema } from "@/lib/schemas/cases";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One case with the conversation it was filed against, as turns.
 *
 * The list endpoint deliberately leaves the snapshots out (they are whole
 * conversations, and the list shows dozens), so opening a case fetches them
 * here. The parsing happens server side because `transcriptOf` is the only
 * thing that knows how to read a legacy `historial` blob, and its result is
 * what every screen renders.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const kase = await getCase(id);
    if (!kase) return jsonError("Caso no encontrado.", 404);

    const { turns, source } = transcriptOf({
      turnos: kase.turnos_snapshot,
      historial: kase.historial_snapshot,
    });
    // The snapshots themselves stay on the server: `turns` is the readable
    // form of exactly the same thing, and the raw blobs are large.
    const { historial_snapshot, turnos_snapshot, ...rest } = kase;
    return NextResponse.json({
      ...rest,
      // Recomputed when the stored cut is null: cases filed before a
      // lead-marked note counted as replayable have it, and deriving it here
      // fixes them without a backfill.
      turno_index: kase.turno_index ?? replayCutFor(kase.turnos_marcados, turns),
      turns,
      source,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * The verdict on a case, set by a person after reading the replay's two
 * replies. `resolvedVersionId: null` reopens it, which is what a later version
 * breaking the case again looks like.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const kase = await getCase(id);
    if (!kase) return jsonError("Caso no encontrado.", 404);

    const input = resolveCaseSchema.parse(await req.json());

    if (input.resolvedVersionId) {
      const version = await getVersion(input.resolvedVersionId);
      if (!version) return jsonError("Esa versión no existe.", 404);
      if (version.client_id !== kase.client_id) {
        return jsonError("Esa versión es de otro cliente.", 400);
      }
    }

    const updated = await setCaseResolution(id, input.resolvedVersionId ?? null);
    return NextResponse.json({
      resolved_version_id: updated.resolved_version_id,
      resolved_at: updated.resolved_at,
    });
  } catch (err) {
    return handleError(err);
  }
}

/** Edits a saved note: its text and the messages it marks. The replay cut is
 *  recomputed from the snapshot, never sent by the client. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const kase = await getCase(id);
    if (!kase) return jsonError("Caso no encontrado.", 404);

    const input = updateCaseSchema.parse(await req.json());
    const { turns } = transcriptOf({
      turnos: kase.turnos_snapshot,
      historial: kase.historial_snapshot,
    });

    const updated = await updateCaseNote(id, {
      nota: input.nota,
      turnosMarcados: input.turnosMarcados,
      turnoIndex: replayCutFor(input.turnosMarcados, turns),
    });
    const { historial_snapshot, turnos_snapshot, ...rest } = updated;
    return NextResponse.json(rest);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteCase(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

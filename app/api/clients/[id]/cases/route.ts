import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db/clients";
import { getConversation } from "@/lib/db/chats-history";
import { listVersions } from "@/lib/db/versions";
import {
  createCase,
  listCasesForConversation,
  replayCutFor,
} from "@/lib/db/conversation-cases";
import { transcriptOf } from "@/lib/conversation-turns";
import { createCaseSchema } from "@/lib/schemas/cases";
import { isChatsConfigured } from "@/lib/supabase";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The saved notes of one conversation, for the notes panel. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    if (!client.chats_table) return NextResponse.json({ cases: [] });

    const rowId = Number(req.nextUrl.searchParams.get("rowId"));
    if (!Number.isFinite(rowId) || rowId <= 0) {
      return jsonError("Falta la conversación.", 400);
    }
    const cases = await listCasesForConversation(id, client.chats_table, rowId);
    return NextResponse.json({
      cases: cases.map(({ historial_snapshot, turnos_snapshot, ...rest }) => rest),
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Saves a note on a real conversation. The note is the case: it is stored
 * right away, with the snapshot and the version frozen, and only gets an
 * Editor session later when the conversation is handed off. Writing a note and
 * never sending it still leaves the evidence behind, which is the point.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    if (!isChatsConfigured()) {
      return jsonError("La conexión con la base de historial no está configurada.", 503);
    }
    if (!client.chats_table) {
      return jsonError("Este cliente no tiene historial conectado.", 409);
    }

    const input = createCaseSchema.parse(await req.json());

    // Read the row again instead of trusting the client: the snapshot has to
    // be what is actually stored, and row_id is the only thing we accept.
    const row = await getConversation(client.chats_table, input.rowId);
    if (!row) return jsonError("La conversación ya no existe.", 404);

    const production = (await listVersions(id)).find((v) => v.is_production);
    if (!production) {
      return jsonError(
        "Este cliente no tiene una versión en producción: no hay contra qué juzgar la conversación.",
        409,
      );
    }

    const { turns } = transcriptOf(row);
    const created = await createCase({
      clientId: id,
      chatsTable: client.chats_table,
      rowId: row.id,
      idDeKommo: row.id_de_kommo,
      conversationAt: row.created_at,
      historialSnapshot: row.historial,
      turnosSnapshot: row.turnos ?? null,
      versionId: production.id,
      turnosMarcados: input.turnosMarcados,
      turnoIndex: replayCutFor(input.turnosMarcados, turns),
      nota: input.nota,
    });

    const { historial_snapshot, turnos_snapshot, ...rest } = created;
    return NextResponse.json(rest, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

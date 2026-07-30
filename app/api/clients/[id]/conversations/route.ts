import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db/clients";
import { getClientHistory } from "@/lib/db/chats-history";
import { isChatsConfigured } from "@/lib/supabase";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** Long enough for a lead's full name, short enough that nobody pastes a
 *  transcript in and makes the chats DB scan for it. */
const MAX_SEARCH = 120;

/**
 * One page of a client's real conversation history, read from the "chats" DB.
 * newest first. Returns { connected: false } when the client has no chats_table
 * mapped yet, so the panel can show the "connect history" state.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);
    if (!isChatsConfigured()) {
      return jsonError("La conexión con la base de historial no está configurada.", 503);
    }
    if (!client.chats_table) {
      return NextResponse.json({
        connected: false,
        table: null,
        rows: [],
        total: 0,
        hasMore: false,
      });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const maxMessages = Number(searchParams.get("maxMessages"));
    const page = await getClientHistory(client.chats_table, {
      limit,
      offset,
      search: searchParams.get("search")?.slice(0, MAX_SEARCH) || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      maxMessages: Number.isFinite(maxMessages) && maxMessages > 0 ? maxMessages : undefined,
    });
    return NextResponse.json({ connected: true, table: client.chats_table, ...page });
  } catch (err) {
    return handleError(err);
  }
}

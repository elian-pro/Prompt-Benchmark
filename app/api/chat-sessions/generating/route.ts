import { NextResponse } from "next/server";
import { listTurns } from "@/lib/jobs/chat-turn";

export const dynamic = "force-dynamic";

/**
 * The sessions generating a reply right now, for the header's global chip and
 * its completion notice. Reads the in-process registry, never the database, so
 * it stays cheap enough to poll every few seconds.
 *
 * The static `generating` segment wins over the sibling `[id]` route, so the
 * only way to shadow a real session is one whose UUID is literally
 * "generating".
 */
export async function GET() {
  return NextResponse.json(listTurns());
}

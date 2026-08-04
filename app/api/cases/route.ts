import { NextRequest, NextResponse } from "next/server";
import { listCases } from "@/lib/db/conversation-cases";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Every client's cases, newest first, or one client's with `?clientId=`.
 * Replay opens on the full list: the question you arrive with is "what is
 * still broken", not "what is broken for this one client".
 */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    return NextResponse.json({ cases: await listCases(clientId) });
  } catch (err) {
    return handleError(err);
  }
}

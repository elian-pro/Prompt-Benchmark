import { NextRequest, NextResponse } from "next/server";
import { listSyncEvents } from "@/lib/db/n8n-sync-events";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json(await listSyncEvents(id));
  } catch (err) {
    return handleError(err);
  }
}

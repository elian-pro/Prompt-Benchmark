import { NextResponse } from "next/server";

import { pendingNotesSummary } from "@/lib/db/demo-links";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Feeds the badge in the header. A static segment, so it resolves before
 *  `/api/demo-links/[id]` and there is no id called "pending-count". */
export async function GET() {
  try {
    return NextResponse.json(await pendingNotesSummary());
  } catch (err) {
    return handleError(err);
  }
}

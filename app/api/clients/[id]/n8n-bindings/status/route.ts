import { NextRequest, NextResponse } from "next/server";
import { listBindings } from "@/lib/db/n8n-bindings";
import { checkDrift } from "@/lib/n8n/sync";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Live drift check for every API binding of a client: compares the node's
 * current systemMessage hash against the last push. Read-only, called when
 * the client detail opens. Manual bindings are skipped (nothing to check).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const bindings = (await listBindings(id)).filter((b) => b.mode === "api");
    const results = await Promise.all(bindings.map(checkDrift));
    return NextResponse.json(results);
  } catch (err) {
    return handleError(err);
  }
}

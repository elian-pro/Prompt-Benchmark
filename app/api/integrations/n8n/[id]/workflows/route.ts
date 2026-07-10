import { NextRequest, NextResponse } from "next/server";
import { getConnectionCreds, getConnection } from "@/lib/db/n8n-connections";
import { listWorkflows } from "@/lib/n8n/client";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Lists a connection's workflows for the binding picker. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const conn = await getConnection(id);
    if (!conn) return jsonError("Conexión n8n no encontrada.", 404);
    const creds = await getConnectionCreds(id);
    return NextResponse.json(await listWorkflows(creds));
  } catch (err) {
    return handleError(err);
  }
}

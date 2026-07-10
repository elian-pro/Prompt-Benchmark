import { NextRequest, NextResponse } from "next/server";
import { getConnectionCreds, getConnection } from "@/lib/db/n8n-connections";
import { getWorkflow } from "@/lib/n8n/client";
import { listAgentNodes } from "@/lib/n8n/agent-node";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; workflowId: string }> };

/**
 * Lists the AI Agent nodes of a workflow, each with a prompt preview, so the
 * user can pick the right one when a workflow holds several.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id, workflowId } = await params;
    const conn = await getConnection(id);
    if (!conn) return jsonError("Conexión n8n no encontrada.", 404);
    const creds = await getConnectionCreds(id);
    const workflow = await getWorkflow(creds, workflowId);
    return NextResponse.json(listAgentNodes(workflow));
  } catch (err) {
    return handleError(err);
  }
}

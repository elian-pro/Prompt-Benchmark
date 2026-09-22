import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db/clients";
import { getConnectionCreds } from "@/lib/db/n8n-connections";
import { getWorkflow } from "@/lib/n8n/client";
import { buildWorkflowExport } from "@/lib/n8n/export";
import { countLegacySupabaseNodes } from "@/lib/n8n/chats-table";
import { resolveTemplate, workflowNameFor } from "@/lib/provisioning";
import { chatsTableName } from "@/lib/chats-table-name";
import { CRM_IDS, DEFAULT_CRM, crmLabel, type Crm } from "@/lib/crm";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * The template flow as JSON for a client that runs its own n8n: we cannot
 * duplicate anything into an instance we do not reach, so the team hands them
 * the file instead. Same copy the provisioning would have created (retargeted
 * at this client's schema, renamed), minus what only means something here.
 *
 * Reads our n8n with the connection's key, so it stays server-side.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const client = await getClient(id);
    if (!client) return jsonError("Cliente no encontrado.", 404);

    const asked = req.nextUrl.searchParams.get("crm");
    if (asked && !CRM_IDS.includes(asked as Crm)) return jsonError("CRM no válido.", 400);
    const crm = (asked as Crm) ?? client.crm ?? DEFAULT_CRM;

    const template = await resolveTemplate({ crm });
    if (!template) {
      return jsonError(
        `No hay flujo plantilla de ${crmLabel(crm)} configurado. Elígelo en Ajustes, en la conexión de n8n.`,
        404,
      );
    }
    // Their conversations live in their own Postgres, so the schema is derived
    // from the name rather than looked up in ours.
    const schema = client.chats_table ?? chatsTableName(client.name);
    if (!schema) {
      return jsonError(
        "El nombre del cliente no produce un nombre de esquema válido: no se puede saber a qué esquema debe escribir el flujo.",
        400,
      );
    }

    const source = await getWorkflow(await getConnectionCreds(template.connectionId), template.workflowId);
    const legacy = countLegacySupabaseNodes(source);
    if (legacy > 0) {
      return jsonError(
        `El flujo plantilla todavía tiene ${legacy} nodo(s) de Supabase. Actualízalo a nodos de Postgres antes de entregarlo.`,
        409,
      );
    }
    const { json, retargeted } = buildWorkflowExport(source, {
      name: workflowNameFor(client.name),
      schema,
    });
    if (retargeted === 0) {
      return jsonError(
        "El flujo plantilla no tiene ningún nodo de Postgres sobre la tabla chats: revisa la plantilla antes de entregarla.",
        409,
      );
    }
    return NextResponse.json({ json, schema, crm });
  } catch (err) {
    return handleError(err);
  }
}

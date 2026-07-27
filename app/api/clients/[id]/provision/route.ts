import { NextRequest, NextResponse } from "next/server";
import { provisionClient, resolveTemplate } from "@/lib/provisioning";
import { provisionClientSchema } from "@/lib/schemas/clients";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Runs the provisioning steps for a client: duplicate its n8n flow and/or
 * create its chats table. Called right after "Nuevo cliente" and again by the
 * retry buttons in the client detail page.
 *
 * Always 200 when the client exists, even if a step failed: the per-step
 * result is the payload, because a failed step is a normal outcome here, not a
 * broken request. Only a missing client or a malformed body go through
 * handleError.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const input = provisionClientSchema.parse(await req.json());
    const template = input.duplicateWorkflow
      ? await resolveTemplate({
          connectionId: input.templateConnectionId,
          workflowId: input.templateWorkflowId,
        })
      : null;

    const provisioning = await provisionClient(id, {
      duplicateWorkflow: input.duplicateWorkflow,
      template: template ?? undefined,
      createChatsTable: input.createChatsTable,
    });
    return NextResponse.json({ provisioning });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getConnectionCreds } from "@/lib/db/n8n-connections";
import { testConnection } from "@/lib/n8n/client";
import { testConnectionSchema } from "@/lib/schemas/n8n";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Probes an n8n instance. Accepts inline creds (unsaved form) or an existing
 * connection id (re-test a saved one). On success returns { ok: true }; any
 * upstream failure surfaces as an N8nApiError -> 502 with a Spanish message.
 */
export async function POST(req: NextRequest) {
  try {
    const input = testConnectionSchema.parse(await req.json());
    const creds =
      input.base_url && input.api_key
        ? { baseUrl: input.base_url, apiKey: input.api_key }
        : await getConnectionCreds(input.id!);
    await testConnection(creds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

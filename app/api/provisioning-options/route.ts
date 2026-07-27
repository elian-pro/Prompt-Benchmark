import { NextResponse } from "next/server";
import { listConnectionsWithTemplate } from "@/lib/provisioning";
import { isChatsAdminConfigured } from "@/lib/chats-admin";
import { isChatsConfigured } from "@/lib/supabase";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * What the Nuevo cliente modal can offer: the n8n templates available to
 * duplicate, and whether creating a chats table is configured at all. Lets the
 * modal hide options that would only fail, the same rule BindOnCreateToggle
 * follows.
 */
export async function GET() {
  try {
    return NextResponse.json({
      templates: await listConnectionsWithTemplate(),
      chatsReady: isChatsConfigured() && isChatsAdminConfigured(),
    });
  } catch (err) {
    return handleError(err);
  }
}

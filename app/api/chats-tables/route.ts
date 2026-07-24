import { NextResponse } from "next/server";
import { listChatsTables } from "@/lib/db/chats-history";
import { isChatsConfigured } from "@/lib/supabase";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Available conversation-history tables in the "chats" DB, for the Library's
 * "connect history" picker. Returns { configured: false } when the second
 * Supabase connection isn't set up, so the UI can explain instead of erroring.
 */
export async function GET() {
  try {
    if (!isChatsConfigured()) {
      return NextResponse.json({ configured: false, tables: [] });
    }
    return NextResponse.json({ configured: true, tables: await listChatsTables() });
  } catch (err) {
    return handleError(err);
  }
}

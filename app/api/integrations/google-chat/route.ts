import { NextRequest, NextResponse } from "next/server";

import { getGoogleChatSettings, updateGoogleChatSettings } from "@/lib/db/google-chat-settings";
import { isGoogleChatConfigured } from "@/lib/google-chat/client";
import { updateGoogleChatSchema } from "@/lib/schemas/google-chat";
import { handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** `configured` is about the server, not the row: without the service account
 *  env vars there is nothing to pick from, and the card says so instead of
 *  offering an empty select. */
export async function GET() {
  try {
    const settings = await getGoogleChatSettings();
    return NextResponse.json({ ...settings, configured: isGoogleChatConfigured() });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const input = updateGoogleChatSchema.parse(await req.json());
    return NextResponse.json(
      await updateGoogleChatSettings({
        spaceName: input.spaceName,
        spaceDisplayName: input.spaceDisplayName ?? null,
      }),
    );
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";

import { getGoogleChatSettings } from "@/lib/db/google-chat-settings";
import { postMessage } from "@/lib/google-chat/client";
import { handleError, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Posts a test message to the chosen space.
 *
 * This is the one place a misconfigured Chat app becomes visible: everywhere
 * else the notification is fire and forget, so "nothing arrived" would have no
 * explanation attached to it.
 */
export async function POST() {
  try {
    const settings = await getGoogleChatSettings();
    if (!settings.space_name) return jsonError("Elige un espacio primero.", 409);

    await postMessage(
      settings.space_name,
      "*Prueba desde Prompt Studio.* Si ves esto, los reportes de tus clientes van a llegar aquí.",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

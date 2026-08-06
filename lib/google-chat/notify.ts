/**
 * The seam between a client's report and Google Chat.
 *
 * Nothing here is allowed to throw. A report is already saved by the time this
 * runs, the bell will show it regardless, and the client on the other side must
 * never see their report fail because Google is having a morning. Every path
 * ends in a return or a console.error.
 *
 * ponytail: no retry and no queue. A lost message costs a glance at the bell,
 * which is the same place the report was going to be reviewed anyway. A queue
 * would be infrastructure for a convenience.
 */
import type { DemoLink } from "../db/demo-links";
import { getClientName } from "../db/clients";
import { getGoogleChatSettings } from "../db/google-chat-settings";
import { buildNoteMessage } from "./message.ts";
import { isGoogleChatConfigured, postMessage } from "./client.ts";

export async function notifyNoteCreated(input: {
  link: DemoLink;
  expected: string;
  complaint: string | null;
  /** The app's own origin, resolved from the request that carried the note. */
  baseUrl: string | null;
}): Promise<void> {
  // Not configured is not a failure: an install without the env vars, or
  // without a space picked, is simply one that does not use this.
  if (!isGoogleChatConfigured()) return;

  try {
    const settings = await getGoogleChatSettings();
    if (!settings.space_name) return;

    const clientName = await getClientName(input.link.client_id);
    await postMessage(
      settings.space_name,
      buildNoteMessage({
        clientName,
        roundLabel: input.link.label ?? `v${input.link.version_number_snapshot}`,
        expected: input.expected,
        complaint: input.complaint,
        url: input.baseUrl ? `${input.baseUrl}/lab/demo/${input.link.id}` : null,
      }),
    );
  } catch (err) {
    console.error("Google Chat: no se pudo avisar del reporte.", err);
  }
}

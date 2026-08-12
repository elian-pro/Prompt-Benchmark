/**
 * Composes the Editor's first message from a demo conversation's notes: one
 * block per note (feedback text, what the bot should have said, plus the
 * messages it tagged, quoted), in the order the notes were written. This is
 * pre-filled into the Editor composer and never sent automatically (Sprint 6,
 * decision 6) — the user reviews and edits it before sending.
 *
 * Used by both the Playground and a client demo link. Which is why the approval
 * filter lives here rather than in the callers: a client's note is a proposal,
 * and the one thing that must never happen is an unreviewed one reaching the
 * Editor because a new call site forgot to filter (Sprint 18).
 */
import type { DemoMessageRow, DemoMessageRole } from "../db/demo-sessions";
import type { DemoNoteRow, DemoNoteWithContext } from "../db/demo-notes";
import { parseTurn } from "../adversarial-message.ts";

const ROLE_LABEL: Record<DemoMessageRole, string> = {
  human: "Tú (lead)",
  bot: "Bot del cliente",
};

function quoteMessage(m: DemoMessageRow): string {
  const { message } = parseTurn(m.content);
  const text = message || "(sin mensaje)";
  return `${ROLE_LABEL[m.role]}: "${text}"`;
}

/**
 * The notes that may reach the Editor: approved, and not handed over already.
 *
 * Playground notes are born approved and never get stamped as sent, so this is
 * still a no-op there. On a client's reports it is both gates at once, which is
 * what stops the same instruction from travelling twice now that a report is
 * reachable from its conversation and from the per client inbox (migration 028).
 */
export function approvedNotes<T extends DemoNoteRow>(notes: T[]): T[] {
  return notes.filter((n) => n.status === "approved" && !n.sent_to_editor_at);
}

/** One numbered report: the complaint, the fix, and the turns it tagged. */
function noteBlock(note: DemoNoteRow, index: number, messagesById: Map<string, DemoMessageRow>) {
  // An id that does not resolve says so out loud. Dropping it silently is how
  // a caller that read only the active round shipped notes to the Editor with
  // their quotes missing and nothing on screen to show it.
  const quotes = note.message_ids.map((mid) => {
    const m = messagesById.get(mid);
    return `   - ${m ? quoteMessage(m) : "(mensaje no disponible)"}`;
  });

  // A client's report may carry only the fix, since "what went wrong" is
  // optional for them (migration 024). When that happens the fix leads the
  // block instead of leaving an empty numbered line.
  const complaint = note.text?.trim();
  const lines = complaint
    ? [`${index}. ${complaint}`]
    : [`${index}. Debió responder: "${note.expected}"`];
  if (note.expected && complaint) {
    // The single most useful line when editing: the client already told us
    // what the right answer was.
    lines.push(`   Debió responder: "${note.expected}"`);
  }
  if (quotes.length > 0) {
    lines.push("   Mensajes citados:");
    lines.push(...quotes);
  }
  return lines.join("\n");
}

export function buildHandoffMessage(
  versionNumber: string,
  notes: DemoNoteRow[],
  messages: DemoMessageRow[],
  options: { source?: "playground" | "demo-link"; clientName?: string | null } = {},
): string {
  const messagesById = new Map(messages.map((m) => [m.id, m]));
  const blocks = approvedNotes(notes).map((note, i) => noteBlock(note, i + 1, messagesById));

  const header =
    options.source === "demo-link"
      ? `Reportes del cliente${options.clientName ? ` (${options.clientName})` : ""} probando la versión ${versionNumber}, ya revisados y aprobados:`
      : `Notas de una conversación de Playground (versión ${versionNumber}):`;

  return [
    header,
    "",
    blocks.join("\n\n"),
    "",
    "Aplica los cambios necesarios al prompt considerando este feedback.",
  ].join("\n");
}

/**
 * The same document, composed out of every approved report of one client
 * instead of one conversation's worth.
 *
 * Reports are grouped by the version they were written against and numbered
 * straight through. A batch that crosses versions is the normal case, not the
 * exception: the client keeps testing while the prompt moves, and an
 * instruction reads differently depending on which text it was a complaint
 * about. Oldest first, because that is the order things were found in.
 */
export function buildClientBatchHandoff(
  clientName: string | null,
  notes: DemoNoteWithContext[],
): string {
  const sendable = approvedNotes(notes)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const groups = new Map<string, DemoNoteWithContext[]>();
  for (const note of sendable) {
    const key = note.version_number ?? "sin versión";
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }

  let index = 0;
  const sections = [...groups].map(([version, groupNotes]) => {
    const blocks = groupNotes.map((note) => {
      index += 1;
      return noteBlock(note, index, new Map(note.messages.map((m) => [m.id, m])));
    });
    return [`Sobre la versión ${version}:`, "", blocks.join("\n\n")].join("\n");
  });

  return [
    `Reportes del cliente${clientName ? ` (${clientName})` : ""}, ya revisados y aprobados:`,
    "",
    sections.join("\n\n"),
    "",
    "Aplica los cambios necesarios al prompt considerando este feedback.",
  ].join("\n");
}

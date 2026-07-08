/**
 * Composes the Editor's first message from a Playground session's notes:
 * one block per note (feedback text, plus the messages it tagged, quoted),
 * in the order the notes were written. This is pre-filled into the Editor
 * composer and never sent automatically (Sprint 6, decision 6) — the user
 * reviews and edits it before sending.
 */
import type { DemoMessageRow, DemoMessageRole } from "../db/demo-sessions";
import type { DemoNoteRow } from "../db/demo-notes";
import { parseTurn } from "../adversarial-message";

const ROLE_LABEL: Record<DemoMessageRole, string> = {
  human: "Tú (lead)",
  bot: "Bot del cliente",
};

function quoteMessage(m: DemoMessageRow): string {
  const { message } = parseTurn(m.content);
  const text = message || "(sin mensaje)";
  return `${ROLE_LABEL[m.role]}: "${text}"`;
}

export function buildHandoffMessage(
  versionNumber: string,
  notes: DemoNoteRow[],
  messages: DemoMessageRow[],
): string {
  const messagesById = new Map(messages.map((m) => [m.id, m]));

  const blocks = notes.map((note, i) => {
    const quotes = note.message_ids
      .map((mid) => messagesById.get(mid))
      .filter((m): m is DemoMessageRow => Boolean(m))
      .map((m) => `   - ${quoteMessage(m)}`);
    const lines = [`${i + 1}. ${note.text}`];
    if (quotes.length > 0) {
      lines.push("   Mensajes citados:");
      lines.push(...quotes);
    }
    return lines.join("\n");
  });

  return [
    `Notas de una conversación de Playground (versión ${versionNumber}):`,
    "",
    blocks.join("\n\n"),
    "",
    "Aplica los cambios necesarios al prompt considerando este feedback.",
  ].join("\n");
}

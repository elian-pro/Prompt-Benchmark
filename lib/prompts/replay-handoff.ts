/**
 * Composes the Editor's first message from a real conversation marked as a
 * case. Pre-filled into the composer, never sent automatically, same rule as
 * the Playground handoff.
 *
 * Deliberately different from buildHandoffMessage (lib/prompts/playground-handoff.ts),
 * which sends only the notes and the messages they tagged. That works there
 * because the user lived the conversation and supplies the missing context
 * from memory. Nobody lived this one: a quoted line with no lead-up does not
 * say whether it was wrong. So the whole conversation goes, with the offending
 * turn marked in place.
 *
 * Pure module (no DB) so the output can be unit-tested directly.
 */
import type { ConversationTurn } from "../conversation-turns";

const ROLE_LABEL: Record<ConversationTurn["rol"], string> = {
  lead: "lead",
  bot: "bot ",
  sistema: "----",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderTurn(turn: ConversationTurn, index: number, failedAt: number | null): string {
  const number = String(index + 1).padStart(2, " ");
  if (turn.rol === "sistema") {
    return `  ${number}. ---- pasa a estado [${turn.estado}]`;
  }
  // The estado is what diagnoses a whole class of bugs ("stayed in
  // por-perfilar", "jumped to humano"), so it travels with the turn.
  const estado = turn.rol === "bot" && turn.estado ? ` [${turn.estado}]` : "";
  const line = `  ${number}. ${ROLE_LABEL[turn.rol]}${estado}: "${turn.texto}"`;
  return index === failedAt ? `${line}\n      ^^^ AQUÍ ESTÁ EL PROBLEMA` : line;
}

export type ReplayHandoffInput = {
  clientName: string;
  versionNumber: string;
  turns: ConversationTurn[];
  /** Index into `turns` of the tagged turn, or null when the note is general. */
  failedAt: number | null;
  nota: string;
  idDeKommo?: string | null;
  conversationAt?: string | null;
  /** True when the conversation predates the version it is being judged
   *  against, so the Editor is told not to trust the pairing. */
  stale?: boolean;
};

export function buildReplayHandoff(input: ReplayHandoffInput): string {
  const { clientName, versionNumber, turns, failedAt, nota } = input;

  const origin = [
    input.idDeKommo ? `lead Kommo ${input.idDeKommo}` : null,
    input.conversationAt ? formatDate(input.conversationAt) : null,
  ].filter(Boolean);

  const header = `Conversación real de ${clientName}${origin.length ? ` (${origin.join(", ")})` : ""}.`;

  const lines = [
    header,
    `Prompt en producción al marcarla: ${versionNumber}`,
    "",
    ...(turns.length > 0
      ? turns.map((t, i) => renderTurn(t, i, failedAt))
      : ["  (No se pudo leer ningún mensaje de esta conversación.)"]),
    "",
    "Lo que salió mal:",
    nota,
    "",
  ];

  if (input.stale) {
    lines.push(
      "OJO: esta conversación es anterior a la versión en producción, así que" +
        " pudo haberla generado un prompt distinto. Confirma que el problema" +
        " sigue vigente antes de cambiar nada.",
      "",
    );
  }

  lines.push(
    "Esta es salida real de producción, no una simulación. Haz el cambio más" +
      " acotado que evite esto sin alterar el resto del flujo.",
  );

  return lines.join("\n");
}

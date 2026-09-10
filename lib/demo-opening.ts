/**
 * What an edited demo link greeting does to one conversation already opened on
 * that link. Pure, so the rule can be tested without a database.
 *
 * Only a conversation where the visitor has not written yet in its current
 * round gets its visible greeting swapped. Once they wrote, the greeting is what
 * they answered to, and rewriting it would change the record of what the client
 * saw. Those still pick up the new text when they restart the chat.
 */
export type OpeningSyncAction = "keep" | "insert" | "update" | "delete";

export function openingSyncAction(
  currentRound: { role: "human" | "bot"; turn_number: number }[],
  text: string | null,
): OpeningSyncAction {
  if (currentRound.some((m) => m.role === "human")) return "keep";
  const seeded = currentRound.some((m) => m.role === "bot" && m.turn_number === 1);
  if (text) return seeded ? "update" : "insert";
  return seeded ? "delete" : "keep";
}

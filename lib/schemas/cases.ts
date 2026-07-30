import { z } from "zod";

/** Filing a real conversation as a case, from the history panel. */
export const createCaseSchema = z.object({
  rowId: z.number().int().positive(),
  nota: z.string().trim().min(1, "Escribe qué salió mal.").max(2000),
  /** Index of the tagged turn. Null when the note is about the conversation as
   *  a whole; the replay needs one, so the UI nudges toward tagging. */
  turnoIndex: z.number().int().min(0).nullable().optional(),
});

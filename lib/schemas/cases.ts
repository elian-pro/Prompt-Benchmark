import { z } from "zod";

/** Filing a real conversation as a case, from the history panel. */
export const createCaseSchema = z.object({
  rowId: z.number().int().positive(),
  nota: z.string().trim().min(1, "Escribe qué salió mal.").max(2000),
  /** Index of the tagged turn. Null when the note is about the conversation as
   *  a whole; the replay needs one, so the UI nudges toward tagging. */
  turnoIndex: z.number().int().min(0).nullable().optional(),
});

/** Re-running a case. Omitting the version means "the one in production now",
 *  which is the usual question: did what I just promoted fix this? */
export const replayCaseSchema = z.object({
  versionId: z.string().uuid().optional(),
});

/** The verdict. Null reopens the case: passing belongs to a version, and a
 *  later one can break it again. */
export const resolveCaseSchema = z.object({
  resolvedVersionId: z.string().uuid().nullable(),
});

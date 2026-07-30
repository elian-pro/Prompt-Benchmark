import { z } from "zod";

/** Saving a note on a real conversation. The note IS the case: a case with no
 *  editor session is simply one nobody has handed off yet. */
export const createCaseSchema = z.object({
  rowId: z.number().int().positive(),
  nota: z.string().trim().min(1, "Escribe qué salió mal.").max(2000),
  /** Every turn the note points at. Empty is allowed (a general note), but
   *  then the case cannot be replayed and the UI says so. */
  turnosMarcados: z.array(z.number().int().min(0)).default([]),
});

/** Editing a saved note. */
export const updateCaseSchema = z.object({
  nota: z.string().trim().min(1, "Escribe qué salió mal.").max(2000),
  turnosMarcados: z.array(z.number().int().min(0)).default([]),
});

/** Handing off every saved note of one conversation in a single Editor
 *  session, the way the Playground sends its notes. */
export const handoffSchema = z.object({
  rowId: z.number().int().positive(),
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

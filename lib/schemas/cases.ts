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
 *  which is the usual question: did what I just promoted fix this?
 *
 *  `continuation` is the replay's own conversation after that first answer:
 *  what the candidate version replied (verbatim, envelope and all, because the
 *  model follows the format of its own previous turns) and what the user typed
 *  playing the lead. It travels on every turn because a replay is not stored
 *  anywhere: the browser holds it, the server only answers. */
export const replayCaseSchema = z.object({
  versionId: z.string().uuid().optional(),
  continuation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(60)
    .default([]),
});

/** The verdict. Null reopens the case: passing belongs to a version, and a
 *  later one can break it again. */
export const resolveCaseSchema = z.object({
  resolvedVersionId: z.string().uuid().nullable(),
});

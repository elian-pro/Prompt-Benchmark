import { z } from "zod";

/** Creating a demo link freezes a client's version, the same way a Playground
 *  session does. The caps have defaults in the database; they are here so the
 *  user can tighten them per link without a migration. */
export const createDemoLinkSchema = z.object({
  clientId: z.string().uuid("Elige un cliente."),
  versionId: z.string().uuid("Elige la versión a probar."),
  openingMessage: z.string().trim().max(2000, "El mensaje de inicio es demasiado largo.").optional(),
  label: z.string().trim().max(120, "El nombre del link es demasiado largo.").optional(),
  maxSessions: z.number().int().min(1).max(500).optional(),
  maxMessages: z.number().int().min(1).max(500).optional(),
});

export const updateDemoLinkSchema = z.object({
  status: z.enum(["active", "closed"]),
});

/**
 * A note left by the client on a demo link. `text` is what is wrong, `expected`
 * is what the bot should have answered instead. The second one is optional
 * because a client who only knows something is off should still be able to say
 * so, and it is the field that saves the most guessing when the prompt is
 * edited afterwards.
 */
export const createClientNoteSchema = z.object({
  text: z
    .string({ required_error: "Cuéntanos qué salió mal." })
    .trim()
    .min(1, "Cuéntanos qué salió mal.")
    .max(4000, "La nota es demasiado larga."),
  expected: z.string().trim().max(4000, "La respuesta esperada es demasiado larga.").optional(),
  messageIds: z.array(z.string().uuid()).default([]),
});

export const updateClientNoteSchema = z
  .object({
    text: z.string().trim().min(1, "Cuéntanos qué salió mal.").max(4000).optional(),
    expected: z.string().trim().max(4000).nullable().optional(),
    messageIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (val) =>
      val.text !== undefined || val.expected !== undefined || val.messageIds !== undefined,
    { message: "No hay cambios que guardar." },
  );

/** The user's verdict on a client's note. Editing the text before approving is
 *  allowed: the client describes a symptom, the user writes the instruction. */
export const reviewDemoNoteSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    text: z.string().trim().min(1, "La nota no puede quedar vacía.").max(4000).optional(),
    expected: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (val) => val.status !== undefined || val.text !== undefined || val.expected !== undefined,
    { message: "No hay cambios que guardar." },
  );

export type CreateDemoLinkInput = z.infer<typeof createDemoLinkSchema>;
export type CreateClientNoteInput = z.infer<typeof createClientNoteSchema>;
export type ReviewDemoNoteInput = z.infer<typeof reviewDemoNoteSchema>;

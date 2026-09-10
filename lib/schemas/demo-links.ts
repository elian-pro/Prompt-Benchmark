import { z } from "zod";

/** A day, never an instant: the admin picks a day and the client is told a
 *  day. See lib/business-days.ts for why that distinction is load bearing. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

/** Creating a demo link freezes a client's version, the same way a Playground
 *  session does. The caps have defaults in the database; they are here so the
 *  user can tighten them per link without a migration. */
const openingMessage = z.string().trim().max(2000, "El mensaje de inicio es demasiado largo.");
const label = z.string().trim().max(120, "El nombre del link es demasiado largo.");
const cap = z.number().int().min(1).max(500);

export const createDemoLinkSchema = z.object({
  clientId: z.string().uuid("Elige un cliente."),
  versionId: z.string().uuid("Elige la versión a probar."),
  openingMessage: openingMessage.optional(),
  label: label.optional(),
  maxSessions: cap.optional(),
  maxMessages: cap.optional(),
  /** Last day the client can leave reports, inclusive. Null: no deadline. */
  expiresOn: isoDate.nullable().optional(),
});

/** Every field is optional and independent: the PATCH carries only what the
 *  user just changed. Null (or empty) clears the name or the greeting. The
 *  client and the version are not here: they are frozen with the link. */
export const updateDemoLinkSchema = z
  .object({
    status: z.enum(["active", "closed"]).optional(),
    expiresOn: isoDate.nullable().optional(),
    label: label.nullable().optional(),
    openingMessage: openingMessage.nullable().optional(),
    maxSessions: cap.optional(),
    maxMessages: cap.optional(),
  })
  .refine((val) => Object.values(val).some((v) => v !== undefined), {
    message: "No hay cambios que guardar.",
  });

/**
 * A note left by the client on a demo link.
 *
 * `expected` is the required one: what the bot should have answered is what
 * actually gets the prompt edited, while "what went wrong" is usually legible
 * from the message they tagged. This is the reverse of how it shipped first,
 * and the reason `demo_notes.text` had to become nullable (migration 024).
 */
export const createClientNoteSchema = z.object({
  expected: z
    .string({ required_error: "Dinos qué debió responder." })
    .trim()
    .min(1, "Dinos qué debió responder.")
    .max(4000, "La respuesta es demasiado larga."),
  text: z.string().trim().max(4000, "La nota es demasiado larga.").optional(),
  messageIds: z.array(z.string().uuid()).default([]),
});

export const updateClientNoteSchema = z
  .object({
    text: z.string().trim().max(4000).nullable().optional(),
    expected: z.string().trim().min(1, "Dinos qué debió responder.").max(4000).optional(),
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
    text: z.string().trim().max(4000).nullable().optional(),
    expected: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (val) => val.status !== undefined || val.text !== undefined || val.expected !== undefined,
    { message: "No hay cambios que guardar." },
  );

export type CreateDemoLinkInput = z.infer<typeof createDemoLinkSchema>;
export type CreateClientNoteInput = z.infer<typeof createClientNoteSchema>;
export type ReviewDemoNoteInput = z.infer<typeof reviewDemoNoteSchema>;

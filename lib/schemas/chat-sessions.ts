import { z } from "zod";

export const sessionTypeSchema = z.enum(["editor", "creator"], {
  errorMap: () => ({ message: "Tipo de sesión no válido." }),
});

// Editor sessions belong to a client from the start and edit that client's
// prompt (base version required). Creator sessions are client-less until
// finalize and may start from an architectural reference OR from scratch, so
// their base version is optional. `type` defaults to 'editor'.
export const createSessionSchema = z
  .object({
    type: sessionTypeSchema.optional().default("editor"),
    clientId: z.string().uuid("El cliente no es válido.").optional(),
    baseVersionId: z.string().uuid("La versión base no es válida.").optional(),
    title: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "editor" && !val.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientId"],
        message: "El cliente es obligatorio.",
      });
    }
    if (val.type === "editor" && !val.baseVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseVersionId"],
        message: "La versión base es obligatoria.",
      });
    }
  });

export const attachmentSchema = z.object({
  uploadId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string().nullable(),
});

export const appendMessageSchema = z.object({
  content: z
    .string({ required_error: "El mensaje es obligatorio." })
    .trim()
    .min(1, "El mensaje es obligatorio."),
  attachments: z.array(attachmentSchema).optional(),
});

// Manual edit of the session's working draft (no AI turn). Empty string is
// allowed so the draft can be cleared.
export const updateDraftSchema = z.object({
  draftContent: z.string({ required_error: "El borrador es obligatorio." }),
});

// Creator sessions have no client until finalize: the new client's metadata is
// collected then. Editor finalize needs no body (it already has a client).
export const finalizeCreatorSchema = z.object({
  name: z
    .string({ required_error: "El nombre del cliente es obligatorio." })
    .trim()
    .min(1, "El nombre del cliente es obligatorio."),
  segment: z.string().trim().min(1).nullable().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type AppendMessageInput = z.infer<typeof appendMessageSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type FinalizeCreatorInput = z.infer<typeof finalizeCreatorSchema>;

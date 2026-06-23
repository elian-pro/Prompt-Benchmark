import { z } from "zod";

export const sessionTypeSchema = z.enum(["editor", "creator"], {
  errorMap: () => ({ message: "Tipo de sesión no válido." }),
});

// Editor sessions belong to a client from the start; creator sessions are
// client-less until finalize (the client is created then). Both require a base
// version: the prompt under edit (editor) or the architectural reference
// (creator). `type` defaults to 'editor' for backward compatibility.
export const createSessionSchema = z
  .object({
    type: sessionTypeSchema.optional().default("editor"),
    clientId: z.string().uuid("El cliente no es válido.").optional(),
    baseVersionId: z
      .string({ required_error: "La versión base es obligatoria." })
      .uuid("La versión base no es válida."),
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

// Creator sessions have no client until finalize: the new client's metadata is
// collected then. Editor finalize needs no body (it already has a client).
export const finalizeCreatorSchema = z.object({
  name: z
    .string({ required_error: "El nombre del cliente es obligatorio." })
    .trim()
    .min(1, "El nombre del cliente es obligatorio."),
  segment: z.string().trim().min(1).nullable().optional(),
  location: z.string().trim().min(1).nullable().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type AppendMessageInput = z.infer<typeof appendMessageSchema>;
export type FinalizeCreatorInput = z.infer<typeof finalizeCreatorSchema>;

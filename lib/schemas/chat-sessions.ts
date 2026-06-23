import { z } from "zod";

export const sessionTypeSchema = z.enum(["editor", "creator"], {
  errorMap: () => ({ message: "Tipo de sesión no válido." }),
});

export const createSessionSchema = z.object({
  clientId: z
    .string({ required_error: "El cliente es obligatorio." })
    .uuid("El cliente no es válido."),
  baseVersionId: z
    .string({ required_error: "La versión base es obligatoria." })
    .uuid("La versión base no es válida."),
  title: z.string().trim().min(1).nullable().optional(),
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

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type AppendMessageInput = z.infer<typeof appendMessageSchema>;

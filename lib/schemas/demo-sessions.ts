import { z } from "zod";

export const createDemoSessionSchema = z.object({
  clientId: z
    .string({ required_error: "El cliente es obligatorio." })
    .uuid("El cliente no es válido."),
  versionId: z
    .string({ required_error: "La versión es obligatoria." })
    .uuid("La versión no es válida."),
  // Optional canned bot message shown as soon as the chat opens (Sprint 14).
  openingMessage: z
    .string()
    .trim()
    .max(2000, "El mensaje de inicio no puede pasar de 2000 caracteres.")
    .optional(),
});

export const updateOpeningMessageSchema = z.object({
  // Editing the opening message after the chat started (Sprint 15).
  openingMessage: z
    .string({ required_error: "El mensaje de inicio es obligatorio." })
    .trim()
    .min(1, "El mensaje de inicio es obligatorio.")
    .max(2000, "El mensaje de inicio no puede pasar de 2000 caracteres."),
});

export const appendDemoMessageSchema = z.object({
  content: z
    .string({ required_error: "El mensaje es obligatorio." })
    .trim()
    .min(1, "El mensaje es obligatorio."),
});

export type CreateDemoSessionInput = z.infer<typeof createDemoSessionSchema>;
export type UpdateOpeningMessageInput = z.infer<typeof updateOpeningMessageSchema>;
export type AppendDemoMessageInput = z.infer<typeof appendDemoMessageSchema>;

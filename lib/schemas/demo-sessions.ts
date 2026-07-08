import { z } from "zod";

export const createDemoSessionSchema = z.object({
  clientId: z
    .string({ required_error: "El cliente es obligatorio." })
    .uuid("El cliente no es válido."),
  versionId: z
    .string({ required_error: "La versión es obligatoria." })
    .uuid("La versión no es válida."),
});

export const appendDemoMessageSchema = z.object({
  content: z
    .string({ required_error: "El mensaje es obligatorio." })
    .trim()
    .min(1, "El mensaje es obligatorio."),
});

export type CreateDemoSessionInput = z.infer<typeof createDemoSessionSchema>;
export type AppendDemoMessageInput = z.infer<typeof appendDemoMessageSchema>;

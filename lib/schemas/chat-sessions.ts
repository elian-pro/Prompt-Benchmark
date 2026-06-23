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

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

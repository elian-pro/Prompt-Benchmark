import { z } from "zod";

export const promptRoleSchema = z.enum(["editor", "creator", "judge"], {
  errorMap: () => ({ message: "Rol de prompt no válido." }),
});

export const savePromptOverrideSchema = z.object({
  content: z
    .string({ required_error: "El contenido del prompt es obligatorio." })
    .trim()
    .min(1, "El prompt no puede estar vacío.")
    .max(100000, "El prompt es demasiado largo."),
});

export type SavePromptOverrideInput = z.infer<typeof savePromptOverrideSchema>;

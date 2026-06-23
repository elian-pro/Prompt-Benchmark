import { z } from "zod";
import { PRESETS } from "@/lib/prompts/adversarial-personas";

export const createRunSchema = z.object({
  clientId: z
    .string({ required_error: "El cliente es obligatorio." })
    .uuid("El cliente no es válido."),
  versionId: z
    .string({ required_error: "La versión es obligatoria." })
    .uuid("La versión no es válida."),
  preset: z.enum(PRESETS, {
    errorMap: () => ({ message: "Persona adversaria no válida." }),
  }),
  intensity: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    errorMap: () => ({ message: "La intensidad debe ser 1, 2 o 3." }),
  }),
  maxTurns: z.number().int().min(2).max(30).optional(),
  starter: z.enum(["bot", "lead"]).optional(),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

import { z } from "zod";

export const clientFilterSchema = z.enum(
  ["all", "production", "editing", "legacy", "archived"],
  { errorMap: () => ({ message: "Filtro no válido." }) },
);

export const createClientSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio."),
  segment: z.string().trim().min(1).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateClientSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio."),
    segment: z.string().trim().min(1).nullable(),
    notes: z.string().nullable(),
    draft_content: z.string().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No se enviaron campos para actualizar.",
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

import { z } from "zod";

export const adapterTypeSchema = z.enum(
  ["openai_compat", "anthropic", "google", "openrouter"],
  { errorMap: () => ({ message: "Tipo de adaptador no válido." }) },
);

export const roleNameSchema = z.enum(
  ["test_bot", "adversarial_lead", "judge", "editor", "creator"],
  { errorMap: () => ({ message: "Rol no válido." }) },
);

export const createProviderSchema = z.object({
  name: z.string({ required_error: "El nombre es obligatorio." }).trim().min(1, "El nombre es obligatorio."),
  adapter_type: adapterTypeSchema,
  base_url: z.string().url("base_url debe ser una URL válida.").nullable().optional(),
  api_key: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const updateProviderSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio."),
    adapter_type: adapterTypeSchema,
    base_url: z.string().url("base_url debe ser una URL válida.").nullable(),
    api_key: z.string().min(1).nullable(),
    enabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No se enviaron campos para actualizar.",
  });

export const addModelSchema = z.object({
  model_name: z
    .string({ required_error: "El nombre del modelo es obligatorio." })
    .trim()
    .min(1, "El nombre del modelo es obligatorio."),
  display_name: z.string().trim().min(1).nullable().optional(),
});

export const toggleModelSchema = z.object({
  enabled: z.boolean({
    required_error: "El campo enabled es obligatorio.",
    invalid_type_error: "El campo enabled debe ser booleano.",
  }),
});

export const setRoleDefaultSchema = z.object({
  provider_id: z
    .string({ required_error: "provider_id es obligatorio." })
    .uuid("provider_id debe ser un UUID válido."),
  model_name: z
    .string({ required_error: "El nombre del modelo es obligatorio." })
    .trim()
    .min(1, "El nombre del modelo es obligatorio."),
  temperature: z.number().min(0).max(2).nullable().optional(),
  top_p: z.number().min(0).max(1).nullable().optional(),
  max_tokens: z.number().int().positive().nullable().optional(),
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type SetRoleDefaultInput = z.infer<typeof setRoleDefaultSchema>;

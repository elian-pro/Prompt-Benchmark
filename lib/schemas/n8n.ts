import { z } from "zod";

export const createConnectionSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio."),
  base_url: z.string().url("La URL base debe ser una URL válida."),
  api_key: z.string({ required_error: "La API key es obligatoria." }).trim().min(1, "La API key es obligatoria."),
});

export const updateConnectionSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio."),
    base_url: z.string().url("La URL base debe ser una URL válida."),
    api_key: z.string().trim().min(1),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No se enviaron campos para actualizar.",
  });

/** Test an unsaved connection (inline creds) or a saved one (by id). */
export const testConnectionSchema = z
  .object({
    id: z.string().uuid().optional(),
    base_url: z.string().url("La URL base debe ser una URL válida.").optional(),
    api_key: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.id || (v.base_url && v.api_key), {
    message: "Envía un id, o bien base_url y api_key.",
  });

export const createApiBindingSchema = z.object({
  connection_id: z.string().uuid("connection_id debe ser un UUID válido."),
  workflow_id: z.string().trim().min(1, "El flujo es obligatorio."),
  workflow_name: z.string().trim().min(1, "El nombre del flujo es obligatorio."),
  node_id: z.string().trim().min(1, "El nodo es obligatorio."),
  node_name: z.string().trim().min(1, "El nombre del nodo es obligatorio."),
  expression_prefix: z.boolean().optional(),
});

export const createManualBindingSchema = z.object({
  manual_label: z
    .string({ required_error: "La etiqueta es obligatoria." })
    .trim()
    .min(1, "La etiqueta es obligatoria."),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
export type CreateApiBindingInput = z.infer<typeof createApiBindingSchema>;
export type CreateManualBindingInput = z.infer<typeof createManualBindingSchema>;

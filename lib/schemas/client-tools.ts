import { z } from "zod";

/** OpenAI's constraint on a function name, and what the model will say back. */
const toolName = z
  .string({ required_error: "El nombre es obligatorio." })
  .trim()
  .regex(
    /^[a-zA-Z0-9_-]{1,64}$/,
    "El nombre solo admite letras, números, guion y guion bajo (máximo 64).",
  );

const paramSchema = z.object({
  name: toolName,
  description: z
    .string({ required_error: "Describe el parámetro." })
    .trim()
    .min(1, "Describe el parámetro: es lo que lee el modelo para rellenarlo."),
  type: z.enum(["string", "number", "boolean"]),
  // Absent means required, so tools saved before this existed keep behaving
  // the same.
  required: z.boolean().optional(),
});

/** Header names/values as a plain object, the shape the executor sends. */
const headersSchema = z.record(z.string().trim().min(1), z.string()).refine(
  (h) => Object.keys(h).length > 0,
  { message: "Añade al menos un header (la RPC de Supabase necesita apikey)." },
);

const bodyTemplateSchema = z.record(z.string(), z.unknown());

export const createToolSchema = z.object({
  name: toolName,
  description: z
    .string({ required_error: "La descripción es obligatoria." })
    .trim()
    .min(1, "La descripción es obligatoria: decide si el modelo usa la herramienta."),
  url: z.string().url("La URL debe ser una URL válida."),
  headers: headersSchema,
  params: z.array(paramSchema).default([]),
  body_template: bodyTemplateSchema.default({}),
  enabled: z.boolean().optional(),
});

export const updateToolSchema = z
  .object({
    name: toolName,
    description: z.string().trim().min(1, "La descripción es obligatoria."),
    url: z.string().url("La URL debe ser una URL válida."),
    // Absent leaves the stored headers untouched: the UI never gets them back
    // in plaintext, so it cannot resend them.
    headers: headersSchema,
    params: z.array(paramSchema),
    body_template: bodyTemplateSchema,
    enabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No se enviaron campos para actualizar.",
  });

export type CreateToolInput = z.infer<typeof createToolSchema>;
export type UpdateToolInput = z.infer<typeof updateToolSchema>;

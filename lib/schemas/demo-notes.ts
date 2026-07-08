import { z } from "zod";

export const createDemoNoteSchema = z.object({
  text: z
    .string({ required_error: "La nota es obligatoria." })
    .trim()
    .min(1, "La nota es obligatoria."),
  messageIds: z.array(z.string().uuid()).default([]),
});

export const updateDemoNoteSchema = z
  .object({
    text: z.string().trim().min(1, "La nota es obligatoria.").optional(),
    messageIds: z.array(z.string().uuid()).optional(),
  })
  .refine((val) => val.text !== undefined || val.messageIds !== undefined, {
    message: "No hay cambios que guardar.",
  });

export type CreateDemoNoteInput = z.infer<typeof createDemoNoteSchema>;
export type UpdateDemoNoteInput = z.infer<typeof updateDemoNoteSchema>;

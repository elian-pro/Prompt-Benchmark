import { z } from "zod";

export const createSegmentSchema = z.object({
  name: z
    .string({ required_error: "El nombre del segmento es obligatorio." })
    .trim()
    .min(1, "El nombre del segmento es obligatorio.")
    .max(40, "El segmento es demasiado largo."),
});

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;

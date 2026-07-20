import { z } from "zod";
import { SMART_PASTE_THRESHOLD_MIN, SMART_PASTE_THRESHOLD_MAX } from "@/lib/smart-paste";

export const updateComposerSettingsSchema = z
  .object({
    smart_paste_enabled: z.boolean(),
    smart_paste_threshold: z
      .number()
      .int("El umbral debe ser un número entero.")
      .min(SMART_PASTE_THRESHOLD_MIN, `El umbral mínimo es ${SMART_PASTE_THRESHOLD_MIN}.`)
      .max(SMART_PASTE_THRESHOLD_MAX, `El umbral máximo es ${SMART_PASTE_THRESHOLD_MAX}.`),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No se enviaron campos para actualizar.",
  });

export type UpdateComposerSettingsInput = z.infer<typeof updateComposerSettingsSchema>;

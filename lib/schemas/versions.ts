import { z } from "zod";

export const bumpTypeSchema = z.enum(["major", "minor", "imported"], {
  errorMap: () => ({ message: "bumpType no válido." }),
});

export const sourceSchema = z.enum(
  ["manual", "editor_chat", "creator_chat", "imported"],
  { errorMap: () => ({ message: "source no válido." }) },
);

export const createVersionSchema = z
  .object({
    content: z.string({ required_error: "content es obligatorio." }),
    bumpType: bumpTypeSchema,
    source: sourceSchema,
    versionNumberOverride: z
      .string()
      .regex(/^v\d+\.\d+$/, "version_number debe tener formato vX.Y")
      .optional(),
    // Optional user-written "what changed" for manual saves — shown per
    // version in the Library. Empty/whitespace is treated as none.
    changeSummary: z.string().max(4000, "El resumen es demasiado largo.").optional(),
  })
  .refine((v) => v.bumpType !== "imported" || Boolean(v.versionNumberOverride), {
    message: "Una versión importada requiere version_number (vX.Y).",
    path: ["versionNumberOverride"],
  });

export type CreateVersionInput = z.infer<typeof createVersionSchema>;

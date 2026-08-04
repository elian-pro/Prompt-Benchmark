import { z } from "zod";

export const sessionTypeSchema = z.enum(["editor", "creator"], {
  errorMap: () => ({ message: "Tipo de sesión no válido." }),
});

// Editor sessions belong to a client from the start and edit that client's
// prompt (base version required). Creator sessions may start from an
// architectural reference OR from scratch, so their base version is optional,
// and their clientId is the client the prompt will land on: optional too,
// since it can also be picked at finalize. `type` defaults to 'editor'.
export const createSessionSchema = z
  .object({
    type: sessionTypeSchema.optional().default("editor"),
    clientId: z.string().uuid("El cliente no es válido.").optional(),
    baseVersionId: z.string().uuid("La versión base no es válida.").optional(),
    title: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "editor" && !val.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientId"],
        message: "El cliente es obligatorio.",
      });
    }
    if (val.type === "editor" && !val.baseVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseVersionId"],
        message: "La versión base es obligatoria.",
      });
    }
  });

export const attachmentSchema = z.object({
  uploadId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string().nullable(),
});

// Structured selection for a message that answers an options block. UI-only:
// persisted so a reopened block shows the exact choices. Kept permissive but
// typed; mirrors the MessageAnswer shape in lib/db/chat-sessions.ts.
export const answerSchema = z.object({
  sourceMessageId: z.string().uuid(),
  selections: z
    .array(
      z.object({
        questionId: z.string().min(1),
        type: z.enum(["single_select", "multi_select", "rank"]),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    )
    .min(1),
});

export const appendMessageSchema = z.object({
  content: z
    .string({ required_error: "El mensaje es obligatorio." })
    .trim()
    .min(1, "El mensaje es obligatorio."),
  attachments: z.array(attachmentSchema).optional(),
  answer: answerSchema.optional(),
});

// Manual edit of the session's working draft (no AI turn). Empty string is
// allowed so the draft can be cleared.
export const updateDraftSchema = z.object({
  draftContent: z.string({ required_error: "El borrador es obligatorio." }),
});

// A Creator session lands either on a client that already exists (clientId) or
// on a brand-new one (name, plus optional segment). The session may already
// carry a target picked at start; the body wins, so the finalize modal can
// still change it. Editor finalize needs no body (it already has a client).
export const finalizeCreatorSchema = z
  .object({
    clientId: z.string().uuid("El cliente no es válido.").optional(),
    name: z.string().trim().min(1, "El nombre del cliente es obligatorio.").optional(),
    segment: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.clientId && !val.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "El nombre del cliente es obligatorio.",
      });
    }
  });

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type AppendMessageInput = z.infer<typeof appendMessageSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type FinalizeCreatorInput = z.infer<typeof finalizeCreatorSchema>;

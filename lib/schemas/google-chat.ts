import { z } from "zod";

/** The space is chosen from a list the API returned, so the shape is known:
 *  validating it keeps a hand-written PATCH from storing something that can
 *  never receive a message. Null turns the notifications off. */
export const updateGoogleChatSchema = z.object({
  spaceName: z
    .string()
    .regex(/^spaces\/[A-Za-z0-9_-]+$/, "Espacio inválido.")
    .nullable(),
  spaceDisplayName: z.string().max(200).nullable().optional(),
});

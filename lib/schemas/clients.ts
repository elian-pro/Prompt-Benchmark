import { z } from "zod";

import { isValidChatsTable } from "../chats-table-name.ts";

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
  // "Importar existente" adds the imported version itself, so it skips the
  // auto-seeded empty v1.0. Defaults to seeding when omitted.
  seedInitialVersion: z.boolean().optional(),
  // Where the agent's n8n lives. Required: both "Nuevo cliente" and "Importar
  // existente" must always ask, so the Library's host tag is never missing.
  n8nHost: z.enum(["zebra", "own"], {
    required_error: "Indica dónde vive el agente: n8n de Zebra o n8n propio.",
    invalid_type_error: "Host de n8n no válido.",
  }),
});

/**
 * Provisioning a client (Sprint 16): duplicate its n8n flow, create its chats
 * table, or both. Sent right after creation and again by the retry buttons in
 * the client detail page, so both flags default to false.
 */
export const provisionClientSchema = z.object({
  duplicateWorkflow: z.boolean().default(false),
  // Per-creation override of the connection's default template. Both or neither.
  templateConnectionId: z.string().uuid("connection_id debe ser un UUID válido.").optional(),
  templateWorkflowId: z.string().trim().min(1).optional(),
  createChatsTable: z.boolean().default(false),
});

export const updateClientSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio."),
    segment: z.string().trim().min(1).nullable(),
    notes: z.string().nullable(),
    draft_content: z.string().nullable(),
    n8n_host: z.enum(["zebra", "own"]),
    // The client's history schema in the chats Postgres, or null to
    // disconnect. Since the August 2026 migration this carries a SCHEMA name,
    // which is the client's real name and therefore has spaces and accents
    // ("Samuel Maya"), so it cannot be matched against a charset regex. Same
    // rule the rest of the code already applies, and applied again server-side
    // before the name reaches a statement.
    chats_table: z
      .string()
      .trim()
      .refine(isValidChatsTable, "Nombre de tabla de historial no válido.")
      .nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No se enviaron campos para actualizar.",
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type ProvisionClientInput = z.infer<typeof provisionClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

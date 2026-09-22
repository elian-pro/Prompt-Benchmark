/**
 * The CRM a client's agent talks to. It decides which n8n flow its workflow is
 * duplicated from: each n8n connection holds one template per CRM.
 *
 * Kommo is the default and was the only one for a long time: every client
 * created before migration 031 is a Kommo client.
 */
export const CRM_IDS = ["kommo", "ghl"] as const;

export type Crm = (typeof CRM_IDS)[number];

export const DEFAULT_CRM: Crm = "kommo";

export const CRMS: { id: Crm; label: string }[] = [
  { id: "kommo", label: "Kommo" },
  { id: "ghl", label: "Go High Level" },
];

export function crmLabel(crm: Crm): string {
  return CRMS.find((c) => c.id === crm)?.label ?? crm;
}

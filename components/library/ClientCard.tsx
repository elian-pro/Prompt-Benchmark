"use client";

import { useRouter } from "next/navigation";
import { IconPencil, IconCopy, IconTrash } from "@tabler/icons-react";
import type { ClientSummary } from "@/lib/db/clients";
import { relativeTimeEs, daysBetween } from "@/lib/format";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

type Props = {
  client: ClientSummary;
  onDelete: (client: ClientSummary) => void;
  onToast: (message: string) => void;
};

/** Badge precedence: NEW → NEW VERSION → LEGACY → none. */
function computeBadge(
  client: ClientSummary,
): { variant: BadgeVariant; label: string } | null {
  const ageDays = daysBetween(client.created_at);
  if (!client.is_legacy && ageDays <= 15) {
    return { variant: "new", label: "Nuevo" };
  }
  if (
    client.latest_version_bump_type === "major" &&
    client.latest_version_created_at &&
    daysBetween(client.latest_version_created_at) <= 5
  ) {
    return { variant: "new-version", label: "Nueva versión" };
  }
  if (client.is_legacy) {
    return { variant: "legacy", label: "Legacy" };
  }
  return null;
}

export function ClientCard({ client, onDelete, onToast }: Props) {
  const router = useRouter();
  const badge = computeBadge(client);
  const versionLabel =
    client.production_version_number ?? client.latest_version_number ?? "—";

  function goToDetail() {
    router.push(`/library/${client.id}`);
  }

  async function copyProduction() {
    try {
      const res = await fetch(`/api/clients/${client.id}`);
      if (!res.ok) throw new Error();
      const detail = await res.json();
      const content: string | undefined = detail.production_version?.content;
      if (!content) {
        onToast("Este cliente no tiene versión de producción.");
        return;
      }
      await navigator.clipboard.writeText(content);
      onToast("Prompt de producción copiado.");
    } catch {
      onToast("No se pudo copiar el prompt.");
    }
  }

  return (
    <div className="card client-card" onClick={goToDetail}>
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="icon-btn"
          title="Editar"
          onClick={goToDetail}
          aria-label="Editar"
        >
          <IconPencil size={16} />
        </button>
        <button
          className="icon-btn"
          title="Copiar prompt de producción"
          onClick={copyProduction}
          aria-label="Copiar"
        >
          <IconCopy size={16} />
        </button>
        <button
          className="icon-btn danger"
          title="Eliminar"
          onClick={() => onDelete(client)}
          aria-label="Eliminar"
        >
          <IconTrash size={16} />
        </button>
      </div>

      {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}

      <div className="client-card-name">{client.name}</div>
      <div className="client-card-meta">
        {[client.segment, client.location].filter(Boolean).join(" · ") || "—"}
      </div>

      <div className="client-card-version">{versionLabel}</div>
      <div className="client-card-foot">
        <span>{relativeTimeEs(client.last_update_at)}</span>
        <span>{client.version_count} / 5 versiones</span>
      </div>
    </div>
  );
}

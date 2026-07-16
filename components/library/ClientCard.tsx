"use client";

import { useRouter } from "next/navigation";
import { IconPencil, IconCopy, IconTrash, IconPlugConnectedX } from "@tabler/icons-react";
import type { ClientSummary } from "@/lib/db/clients";
import { relativeTimeEs } from "@/lib/format";
import { isNewClient, isNewVersion, N8N_HOST_LABEL } from "@/lib/badges";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

type Props = {
  client: ClientSummary;
  onDelete: (client: ClientSummary) => void;
  onToast: (message: string) => void;
  variant?: "card" | "row";
  /** Position in the list — drives the staggered enter animation. */
  index?: number;
};

/** Badge precedence: NEW → NEW VERSION → LEGACY → none. */
function computeBadge(
  client: ClientSummary,
): { variant: BadgeVariant; label: string } | null {
  if (isNewClient(client.created_at, client.is_legacy)) {
    return { variant: "new", label: "Nuevo" };
  }
  if (
    isNewVersion(client.latest_version_bump_type, client.latest_version_created_at)
  ) {
    return { variant: "new-version", label: "Nueva versión" };
  }
  if (client.is_legacy) {
    return { variant: "legacy", label: "Legacy" };
  }
  return null;
}

export function ClientCard({
  client,
  onDelete,
  onToast,
  variant = "card",
  index,
}: Props) {
  const router = useRouter();
  const badge = computeBadge(client);
  const versionLabel =
    client.production_version_number ?? client.latest_version_number ?? "-";

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

  // Cap the stagger so long lists still finish quickly.
  const style =
    index != null ? { animationDelay: `${Math.min(index, 12) * 28}ms` } : undefined;

  const pendingIcon = client.has_pending_n8n_deploy ? (
    <span className="n8n-pending-icon" title="Despliegue manual pendiente en n8n">
      <IconPlugConnectedX size={15} />
    </span>
  ) : null;

  const actions = (
    <div className="card-actions" onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" title="Editar" onClick={goToDetail} aria-label="Editar">
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
  );

  if (variant === "row") {
    return (
      <div className="card client-row" style={style} onClick={goToDetail}>
        <span className="row-name">
          {client.name}
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          <Badge variant="n8n">{N8N_HOST_LABEL[client.n8n_host]}</Badge>
          {pendingIcon}
        </span>
        <span className="row-segment">{client.segment || "-"}</span>
        <span className="row-version">{versionLabel}</span>
        <span className="row-updated">{relativeTimeEs(client.last_update_at)}</span>
        <span className="row-count">{client.version_count} / 5</span>
        {actions}
      </div>
    );
  }

  return (
    <div className="card client-card" style={style} onClick={goToDetail}>
      <div className="client-card-top">
        <span className="row-between" style={{ gap: 6 }}>
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          <Badge variant="n8n">{N8N_HOST_LABEL[client.n8n_host]}</Badge>
          {pendingIcon}
        </span>
        {actions}
      </div>

      <div className="client-card-name">{client.name}</div>
      <div className="client-card-meta">{client.segment || "-"}</div>

      <div className="client-card-version">{versionLabel}</div>
      <div className="client-card-foot">
        <span>{relativeTimeEs(client.last_update_at)}</span>
        <span>{client.version_count} / 5 versiones</span>
      </div>
    </div>
  );
}

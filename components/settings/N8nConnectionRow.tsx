"use client";

import type { MaskedConnection } from "@/lib/db/n8n-connections";
import { Button } from "@/components/ui/Button";

type Props = {
  connection: MaskedConnection;
  onEdit: (connection: MaskedConnection) => void;
  onDelete: (connection: MaskedConnection) => void;
};

export function N8nConnectionRow({ connection, onEdit, onDelete }: Props) {
  return (
    <div className="card">
      <div className="provider-head" style={{ cursor: "default" }}>
        <div>
          <div className="provider-name">{connection.name}</div>
          <div className="adapter-label">{connection.base_url}</div>
          <div className="adapter-label">
            {connection.template_workflow_name
              ? `Plantilla Kommo: ${connection.template_workflow_name}`
              : "Sin flujo plantilla de Kommo"}
          </div>
          <div className="adapter-label">
            {connection.template_workflow_name_ghl
              ? `Plantilla Go High Level: ${connection.template_workflow_name_ghl}`
              : "Sin flujo plantilla de Go High Level"}
          </div>
        </div>
        <div className="provider-actions">
          <span className="masked-key">{connection.api_key_masked}</span>
          <Button size="sm" variant="secondary" onClick={() => onEdit(connection)}>
            Editar
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(connection)}>
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}

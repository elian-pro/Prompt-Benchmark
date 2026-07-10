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

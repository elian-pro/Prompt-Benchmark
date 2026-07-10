"use client";

import { useEffect, useState } from "react";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * Optional "bind an n8n node after creating" toggle, shared by the new-client
 * and import modals. Renders nothing until it confirms at least one n8n
 * connection exists, so the option only appears when it can actually be used.
 */
export function BindOnCreateToggle({ checked, onChange }: Props) {
  const [hasConnections, setHasConnections] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/integrations/n8n")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown[]) => {
        if (alive) setHasConnections(Array.isArray(rows) && rows.length > 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!hasConnections) return null;

  return (
    <div className="field">
      <label className="switch-inline" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>Vincular un nodo de n8n a este cliente después de crearlo</span>
      </label>
    </div>
  );
}

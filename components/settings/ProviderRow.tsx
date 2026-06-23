"use client";

import { useState } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { MaskedProvider } from "@/lib/db/providers";
import { Button } from "@/components/ui/Button";

type Props = {
  provider: MaskedProvider;
  onEdit: (provider: MaskedProvider) => void;
  onDelete: (provider: MaskedProvider) => void;
  onChanged: () => void;
};

export function ProviderRow({ provider, onEdit, onDelete, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, options: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Operación fallida.");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function addModel() {
    const model_name = newModel.trim();
    if (!model_name) return;
    setNewModel("");
    await call(`/api/providers/${provider.id}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_name }),
    });
  }

  return (
    <div className="card">
      <div className="provider-head" onClick={() => setExpanded((v) => !v)}>
        <div className="row-between" style={{ gap: 12 }}>
          {expanded ? (
            <IconChevronDown size={18} className="muted" />
          ) : (
            <IconChevronRight size={18} className="muted" />
          )}
          <div>
            <div className="provider-name">{provider.name}</div>
            <div className="adapter-label">
              {provider.adapter_type}
              {!provider.enabled && " · deshabilitado"}
            </div>
          </div>
        </div>
        <div className="provider-actions" onClick={(e) => e.stopPropagation()}>
          <span className="masked-key">{provider.api_key_masked ?? "sin clave"}</span>
          <Button size="sm" variant="secondary" onClick={() => onEdit(provider)}>
            Editar
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(provider)}>
            Eliminar
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="model-area">
          <div className="field-label" style={{ marginBottom: 12 }}>
            Modelos
          </div>
          {provider.models.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Sin modelos todavía.
            </p>
          ) : (
            <div className="model-list">
              {provider.models.map((m) => (
                <div key={m.id} className="model-item">
                  <span className={`model-name${m.enabled ? "" : " disabled"}`}>
                    {m.display_name ? `${m.display_name} (${m.model_name})` : m.model_name}
                  </span>
                  <div className="provider-actions">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        disabled={busy}
                        onChange={(e) =>
                          call(`/api/providers/${provider.id}/models/${m.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ enabled: e.target.checked }),
                          })
                        }
                      />
                      <span className="slider" />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<IconTrash size={14} />}
                      disabled={busy}
                      onClick={() =>
                        call(`/api/providers/${provider.id}/models/${m.id}`, {
                          method: "DELETE",
                        })
                      }
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="model-add">
            <input
              className="input"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addModel()}
              placeholder="gpt-4o-mini"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<IconPlus size={14} />}
              disabled={busy || !newModel.trim()}
              onClick={addModel}
            >
              Agregar modelo
            </Button>
          </div>

          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { MaskedProvider, AdapterType } from "@/lib/db/providers";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const ADAPTER_OPTIONS: { value: AdapterType; label: string }[] = [
  { value: "openai_compat", label: "OpenAI / Compatible" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
];

const NEEDS_BASE_URL: AdapterType[] = ["openai_compat", "openrouter"];

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  provider?: MaskedProvider | null;
};

export function ProviderFormModal({ open, onClose, onSaved, provider }: Props) {
  const editing = Boolean(provider);
  const [name, setName] = useState(provider?.name ?? "");
  const [adapterType, setAdapterType] = useState<AdapterType>(
    provider?.adapter_type ?? "openai_compat",
  );
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsBaseUrl = NEEDS_BASE_URL.includes(adapterType);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      adapter_type: adapterType,
      enabled,
      base_url: needsBaseUrl ? baseUrl.trim() || null : null,
    };
    // Only send the key when the user typed one (edit keeps the existing key).
    if (apiKey.trim()) payload.api_key = apiKey.trim();

    try {
      const res = await fetch(
        editing ? `/api/providers/${provider!.id}` : "/api/providers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar el proveedor.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar proveedor" : "Agregar proveedor"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Nombre</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="OpenAI"
        />
      </div>

      <div className="field">
        <label className="field-label">Tipo de adaptador</label>
        <select
          className="select"
          value={adapterType}
          onChange={(e) => setAdapterType(e.target.value as AdapterType)}
        >
          {ADAPTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {needsBaseUrl && (
        <div className="field">
          <label className="field-label">Base URL</label>
          <input
            className="input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>
      )}

      <div className="field">
        <label className="field-label">API key</label>
        <textarea
          className="textarea"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            editing
              ? `Dejar en blanco para conservar la actual (${provider?.api_key_masked ?? "sin clave"})`
              : "Pega aquí la API key"
          }
        />
      </div>

      <div className="row-between" style={{ marginTop: 8 }}>
        <span className="field-label">Habilitado</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="slider" />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

"use client";

import { useState } from "react";
import type { MaskedProvider } from "@/lib/db/providers";
import type { RoleDefault, RoleName } from "@/lib/db/role-defaults";
import { Button } from "@/components/ui/Button";

const ROLES: { role: RoleName; label: string }[] = [
  { role: "test_bot", label: "Bot bajo prueba" },
  { role: "adversarial_lead", label: "Lead adversarial" },
  { role: "judge", label: "Juez" },
  { role: "editor", label: "Editor" },
  { role: "creator", label: "Creador" },
];

type Props = {
  providers: MaskedProvider[];
  roleDefaults: RoleDefault[];
  onSaved: () => void;
};

export function RoleAssignments({ providers, roleDefaults, onSaved }: Props) {
  const enabledProviders = providers.filter((p) => p.enabled);
  return (
    <div className="role-list">
      {ROLES.map(({ role, label }) => (
        <RoleRow
          key={role}
          role={role}
          label={label}
          providers={enabledProviders}
          current={roleDefaults.find((r) => r.role === role) ?? null}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

function RoleRow({
  role,
  label,
  providers,
  current,
  onSaved,
}: {
  role: RoleName;
  label: string;
  providers: MaskedProvider[];
  current: RoleDefault | null;
  onSaved: () => void;
}) {
  const [providerId, setProviderId] = useState(current?.provider_id ?? "");
  const [modelName, setModelName] = useState(current?.model_name ?? "");
  const [temperature, setTemperature] = useState(
    current?.temperature != null ? String(current.temperature) : "",
  );
  const [topP, setTopP] = useState(current?.top_p != null ? String(current.top_p) : "");
  const [maxTokens, setMaxTokens] = useState(
    current?.max_tokens != null ? String(current.max_tokens) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedProvider = providers.find((p) => p.id === providerId);
  const models = selectedProvider?.models.filter((m) => m.enabled) ?? [];

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        provider_id: providerId,
        model_name: modelName,
        temperature: temperature.trim() ? Number(temperature) : null,
        top_p: topP.trim() ? Number(topP) : null,
        max_tokens: maxTokens.trim() ? Number(maxTokens) : null,
      };
      const res = await fetch(`/api/role-defaults/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar la asignación.");
      }
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="role-row">
        <span className="role-label">{label}</span>

        <select
          className="select"
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value);
            setModelName("");
          }}
        >
          <option value="">— Proveedor —</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={modelName}
          disabled={!providerId}
          onChange={(e) => setModelName(e.target.value)}
        >
          <option value="">— Modelo —</option>
          {models.map((m) => (
            <option key={m.id} value={m.model_name}>
              {m.display_name ?? m.model_name}
            </option>
          ))}
        </select>

        <input
          className="input"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          placeholder="temp"
          inputMode="decimal"
        />
        <input
          className="input"
          value={topP}
          onChange={(e) => setTopP(e.target.value)}
          placeholder="top_p"
          inputMode="decimal"
        />
        <input
          className="input"
          value={maxTokens}
          onChange={(e) => setMaxTokens(e.target.value)}
          placeholder="máx"
          inputMode="numeric"
        />

        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={saving || !providerId || !modelName}
        >
          {saving ? "…" : saved ? "Guardado" : "Guardar"}
        </Button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

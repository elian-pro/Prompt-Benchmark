"use client";

import { useState } from "react";
import type { MaskedProvider } from "@/lib/db/providers";
import type { RoleDefault, RoleName } from "@/lib/db/role-defaults";
import { catalogFor } from "@/lib/model-catalog";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { RangeField } from "@/components/settings/RangeField";

const ROLES: { role: RoleName; label: string }[] = [
  { role: "test_bot", label: "Bot bajo prueba" },
  { role: "adversarial_lead", label: "Lead adversarial" },
  { role: "judge", label: "Juez" },
  { role: "editor", label: "Editor" },
  { role: "creator", label: "Creador" },
];

const TEMPERATURE_HINT =
  "Controla la aleatoriedad de las respuestas. Valores bajos (0–0.3) las hacen más predecibles y consistentes; valores altos (0.8–2) las hacen más creativas y variadas.";
const TOP_P_HINT =
  "Muestreo por núcleo (top-p). Limita la elección a las palabras más probables cuya probabilidad acumulada llega a este valor. 1 considera todas; valores menores (p. ej. 0.9) descartan las menos probables.";
const MAX_TOKENS_HINT =
  "Número máximo de tokens que el modelo puede generar en su respuesta. Un token equivale aproximadamente a 0.75 palabras. Déjalo en Auto para usar el límite por defecto.";

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

  // Merge the provider's configured models with the preloaded catalog for its
  // adapter type, so a role can be assigned a known model even before it's been
  // added to the provider manually.
  const configuredNames = new Set(models.map((m) => m.model_name));
  const catalogExtras = selectedProvider
    ? catalogFor(selectedProvider.adapter_type).filter(
        (c) => !configuredNames.has(c.model_name),
      )
    : [];

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
        <div className="role-row-top">
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
            {models.length > 0 && (
              <optgroup label="Configurados">
                {models.map((m) => (
                  <option key={m.id} value={m.model_name}>
                    {m.display_name ?? m.model_name}
                  </option>
                ))}
              </optgroup>
            )}
            {catalogExtras.length > 0 && (
              <optgroup label="Disponibles">
                {catalogExtras.map((c) => (
                  <option key={c.model_name} value={c.model_name}>
                    {c.display_name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="role-row-params">
          <RangeField
            label="Temperatura"
            hint={TEMPERATURE_HINT}
            value={temperature}
            onChange={setTemperature}
            min={0}
            max={2}
            step={0.05}
            defaultValue={1}
          />
          <RangeField
            label="Top P"
            hint={TOP_P_HINT}
            value={topP}
            onChange={setTopP}
            min={0}
            max={1}
            step={0.05}
            defaultValue={1}
          />

          <div className="range-field">
            <div className="range-field-head">
              <span className="param-label">
                Máx tokens
                <InfoHint text={MAX_TOKENS_HINT} />
              </span>
            </div>
            <input
              className="input"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="Auto"
              inputMode="numeric"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={saving || !providerId || !modelName}
          >
            {saving ? "…" : saved ? "Guardado" : "Guardar"}
          </Button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

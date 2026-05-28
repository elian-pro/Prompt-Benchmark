"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  ModelSettings,
  RoleId,
  ROLE_META,
  ModelOption,
} from "@/lib/models";

type KeySource = "env" | "file" | "unset";

interface KeyStatus {
  configured: boolean;
  masked: string | null;
  source: KeySource;
  locked: boolean;
}

interface PublicSettings {
  openai: KeyStatus;
  anthropic: KeyStatus;
  models: ModelSettings;
}

const ROLE_ORDER: RoleId[] = ["tested_bot", "adversarial_lead", "judge"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [models, setModels] = useState<ModelSettings | null>(null);
  const [openaiInput, setOpenaiInput] = useState("");
  const [anthropicInput, setAnthropicInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((data: PublicSettings) => {
        setSettings(data);
        setModels(data.models);
      })
      .catch(() => setMessage("No se pudo cargar la configuración."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!models) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = { models };
      // Only send keys that the user actually typed AND that aren't env-locked.
      if (openaiInput.trim() && !settings?.openai.locked) {
        payload.openaiKey = openaiInput.trim();
      }
      if (anthropicInput.trim() && !settings?.anthropic.locked) {
        payload.anthropicKey = anthropicInput.trim();
      }
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error al guardar.");
      setSettings(data.settings);
      setModels(data.settings.models);
      setOpenaiInput("");
      setAnthropicInput("");
      const ignored: string[] = data.ignored ?? [];
      setMessage(
        ignored.length
          ? `Guardado. (Keys ignoradas por venir de variable de entorno: ${ignored.join(", ")})`
          : "Configuración guardada.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  function updateRole(role: RoleId, patch: Partial<ModelSettings[RoleId]>) {
    setModels((prev) =>
      prev ? { ...prev, [role]: { ...prev[role], ...patch } } : prev,
    );
  }

  if (loading) {
    return (
      <Shell>
        <p className="label">Cargando…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1
        style={{
          fontWeight: 800,
          fontSize: "2rem",
          letterSpacing: "0.04em",
          margin: "0 0 2.5rem",
        }}
      >
        SETTINGS
      </h1>

      {/* ---- API KEYS ---- */}
      <section style={{ marginBottom: "3rem" }}>
        <p className="label" style={{ marginBottom: "1.25rem" }}>
          API Keys
        </p>

        <KeyField
          name="OpenAI"
          status={settings?.openai}
          value={openaiInput}
          onChange={setOpenaiInput}
          placeholder="sk-..."
        />
        <KeyField
          name="Anthropic"
          status={settings?.anthropic}
          value={anthropicInput}
          onChange={setAnthropicInput}
          placeholder="sk-ant-..."
        />
      </section>

      {/* ---- MODELS / PARAMS PER ROLE ---- */}
      <section style={{ marginBottom: "3rem" }}>
        <p className="label" style={{ marginBottom: "1.25rem" }}>
          Modelos y parámetros
        </p>
        {models &&
          ROLE_ORDER.map((role) => (
            <RoleConfigRow
              key={role}
              role={role}
              config={models[role]}
              onChange={(patch) => updateRole(role, patch)}
            />
          ))}
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Guardando…" : "Guardar →"}
        </button>
        {message && (
          <span className="label" style={{ color: "var(--fg)" }}>
            {message}
          </span>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "3rem 1.5rem 6rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "3.5rem",
        }}
      >
        <Link href="/" className="pill">
          ZEBRA | LEAD STRESS
        </Link>
        <Link href="/" className="label">
          ← Inicio
        </Link>
      </header>
      {children}
    </main>
  );
}

function KeyField({
  name,
  status,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  status?: KeyStatus;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const locked = status?.locked ?? false;
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "0.4rem",
        }}
      >
        <span className="label">{name}</span>
        <KeyBadge status={status} />
      </div>
      <input
        type="password"
        value={value}
        placeholder={
          locked
            ? "Definida por variable de entorno (no editable)"
            : status?.configured
              ? "Pegar nueva key para reemplazar"
              : placeholder
        }
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

function KeyBadge({ status }: { status?: KeyStatus }) {
  if (!status || status.source === "unset") {
    return (
      <span className="label" style={{ color: "#b85c5c" }}>
        Sin configurar
      </span>
    );
  }
  if (status.source === "env") {
    return (
      <span className="label" style={{ color: "var(--fg)" }}>
        {status.masked} · variable de entorno
      </span>
    );
  }
  return (
    <span className="label" style={{ color: "var(--fg)" }}>
      {status.masked} · archivo local
    </span>
  );
}

function RoleConfigRow({
  role,
  config,
  onChange,
}: {
  role: RoleId;
  config: ModelSettings[RoleId];
  onChange: (patch: Partial<ModelSettings[RoleId]>) => void;
}) {
  const meta = ROLE_META[role];
  const options: ModelOption[] =
    meta.provider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS;

  return (
    <div
      style={{
        borderTop: "1px solid var(--line)",
        padding: "1.5rem 0",
      }}
    >
      <p style={{ margin: "0 0 1rem", fontWeight: 600 }}>
        {meta.label}{" "}
        <span className="label" style={{ marginLeft: 8 }}>
          {meta.provider}
        </span>
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "1.25rem",
          alignItems: "end",
        }}
      >
        <div>
          <p className="label" style={{ marginBottom: "0.4rem" }}>
            Modelo
          </p>
          <select
            value={config.model}
            onChange={(e) => onChange({ model: e.target.value })}
            style={{ width: "100%" }}
          >
            {options.some((o) => o.id === config.model) ? null : (
              <option value={config.model}>{config.model}</option>
            )}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <SliderField
          label={`Temperature · ${config.temperature.toFixed(2)}`}
          value={config.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => onChange({ temperature: v })}
        />
        <SliderField
          label={`Top_p · ${config.top_p.toFixed(2)}`}
          value={config.top_p}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ top_p: v })}
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="label" style={{ marginBottom: "0.4rem" }}>
        {label}
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

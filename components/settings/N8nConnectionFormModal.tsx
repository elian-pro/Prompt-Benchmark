"use client";

import { useState } from "react";
import type { MaskedConnection } from "@/lib/db/n8n-connections";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  connection?: MaskedConnection | null;
};

export function N8nConnectionFormModal({ open, onClose, onSaved, connection }: Props) {
  const editing = Boolean(connection);
  const [name, setName] = useState(connection?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    setError(null);
    setTestMsg(null);
    try {
      // Test inline creds when a key was typed; otherwise re-test the saved one.
      const payload =
        apiKey.trim()
          ? { base_url: baseUrl.trim(), api_key: apiKey.trim() }
          : { id: connection!.id };
      const res = await fetch("/api/integrations/n8n/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo probar la conexión.");
      }
      setTestMsg("Conexión correcta.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      base_url: baseUrl.trim(),
    };
    if (apiKey.trim()) payload.api_key = apiKey.trim();

    try {
      const res = await fetch(
        editing ? `/api/integrations/n8n/${connection!.id}` : "/api/integrations/n8n",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar la conexión.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  // A new connection needs a key; an existing one can keep its stored key.
  const canSave = name.trim() && baseUrl.trim() && (editing || apiKey.trim());
  const canTest = baseUrl.trim() && (apiKey.trim() || editing);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar conexión n8n" : "Agregar conexión n8n"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={testing || saving || !canTest}
          >
            {testing ? "Probando…" : "Probar conexión"}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !canSave}>
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
          placeholder="Zebra"
        />
      </div>

      <div className="field">
        <label className="field-label">URL base</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://n8n.tudominio.com"
        />
      </div>

      <div className="field">
        <label className="field-label">API key</label>
        <textarea
          className="textarea"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            editing
              ? `Dejar en blanco para conservar la actual (${connection?.api_key_masked ?? "sin clave"})`
              : "Genérala en n8n: Ajustes → n8n API"
          }
        />
      </div>

      {testMsg && <p className="form-ok">{testMsg}</p>}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

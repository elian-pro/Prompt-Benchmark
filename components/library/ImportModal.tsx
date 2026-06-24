"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SegmentPicker } from "@/components/library/SegmentPicker";

const VERSION_RE = /^v\d+\.\d+$/;

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [content, setContent] = useState("");
  const [versionNumber, setVersionNumber] = useState("v1.0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionValid = VERSION_RE.test(versionNumber.trim());
  const canSubmit = Boolean(name.trim()) && Boolean(content.trim()) && versionValid;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const cRes = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          segment: segment.trim() || null,
        }),
      });
      if (!cRes.ok) {
        const data = await cRes.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo crear el cliente.");
      }
      const { client } = await cRes.json();

      const vRes = await fetch(`/api/clients/${client.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          bumpType: "imported",
          source: "imported",
          versionNumberOverride: versionNumber.trim(),
        }),
      });
      if (!vRes.ok) {
        const data = await vRes.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo importar la versión.");
      }
      router.push(`/library/${client.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar existente"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving || !canSubmit}>
            {saving ? "Importando…" : "Importar"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Nombre</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">Segmento</label>
        <SegmentPicker value={segment} onChange={setSegment} />
      </div>
      <div className="field">
        <label className="field-label">Número de versión</label>
        <input
          className="input"
          value={versionNumber}
          onChange={(e) => setVersionNumber(e.target.value)}
          placeholder="v1.0"
        />
        {!versionValid && versionNumber.length > 0 && (
          <p className="form-error">Formato inválido. Usa vX.Y (p. ej. v2.5).</p>
        )}
      </div>
      <div className="field">
        <label className="field-label">Prompt</label>
        <textarea
          className="textarea"
          style={{ minHeight: 180 }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Pega aquí el prompt de producción"
        />
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

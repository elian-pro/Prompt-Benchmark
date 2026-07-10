"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SegmentPicker } from "@/components/library/SegmentPicker";
import { BindOnCreateToggle } from "@/components/library/BindOnCreateToggle";

export function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [notes, setNotes] = useState("");
  const [bindAfter, setBindAfter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          segment: segment.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo crear el cliente.");
      }
      const { client } = await res.json();
      router.push(`/library/${client.id}${bindAfter ? "?bind=1" : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo cliente"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? "Creando…" : "Crear"}
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
        <label className="field-label">Notas</label>
        <textarea
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <BindOnCreateToggle checked={bindAfter} onChange={setBindAfter} />
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

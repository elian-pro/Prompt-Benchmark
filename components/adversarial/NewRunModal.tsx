"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconTargetArrow } from "@tabler/icons-react";
import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import type { VersionListItem } from "@/lib/db/versions";
import {
  PRESETS,
  PRESET_LABELS,
  PRESET_DESCRIPTIONS,
  type Preset,
  type Intensity,
} from "@/lib/prompts/adversarial-personas";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SelectChip } from "@/components/ui/SelectChip";

const INTENSITIES: Intensity[] = [1, 2, 3];

/**
 * Configures a new adversarial run: pick the client + version to test, the
 * adversarial persona and intensity, max turns and who starts. On submit it
 * creates the run and routes to its detail page (where it gets executed).
 */
export function NewRunModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [versions, setVersions] = useState<VersionListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [preset, setPreset] = useState<Preset>("caotico");
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [maxTurns, setMaxTurns] = useState(12);
  const [starter, setStarter] = useState<"bot" | "lead">("bot");
  const [leadBrief, setLeadBrief] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/clients?filter=all")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
        return res.json();
      })
      .then((data: ClientSummary[]) => setClients(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar los clientes."))
      .finally(() => setLoading(false));
  }, [open]);

  // Load the chosen client's versions and default to production (else latest).
  useEffect(() => {
    if (!clientId) {
      setVersions([]);
      setVersionId("");
      return;
    }
    fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar el cliente.");
        return res.json();
      })
      .then((detail: ClientDetail) => {
        setVersions(detail.versions);
        setVersionId(detail.production_version?.id ?? detail.versions[0]?.id ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar las versiones."));
  }, [clientId]);

  async function submit() {
    if (!clientId || !versionId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          versionId,
          preset,
          intensity,
          maxTurns,
          starter,
          leadBrief: leadBrief.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo crear la prueba.");
      const run = await res.json();
      router.push(`/adversarial/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva prueba adversaria"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={creating || !clientId || !versionId}
          >
            {creating ? "Creando…" : "Crear y ejecutar"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Cliente</label>
        <SelectChip
          icon={<IconTargetArrow size={13} />}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={loading}
        >
          <option value="">{loading ? "Cargando clientes…" : "Selecciona un cliente…"}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectChip>
      </div>

      {clientId && (
        <div className="field">
          <label className="field-label">Versión a probar</label>
          <select
            className="select"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
          >
            {versions.length === 0 && <option value="">Sin versiones</option>}
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version_number}
                {v.is_production ? " · producción" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="field-label">Persona adversaria</label>
        <select
          className="select"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="field-hint">{PRESET_DESCRIPTIONS[preset]}</p>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field-label">Intensidad</label>
          <select
            className="select"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value) as Intensity)}
          >
            {INTENSITIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Turnos máximos</label>
          <input
            className="input"
            type="number"
            min={2}
            max={30}
            value={maxTurns}
            onChange={(e) => setMaxTurns(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label className="field-label">Inicia</label>
          <select
            className="select"
            value={starter}
            onChange={(e) => setStarter(e.target.value as "bot" | "lead")}
          >
            <option value="bot">Agente</option>
            <option value="lead">Lead</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Situación del lead (opcional)</label>
        <textarea
          className="textarea"
          rows={2}
          maxLength={300}
          placeholder="Ej: Eres un empresario, tienes un presupuesto de 20mdp y quieres una casa."
          value={leadBrief}
          onChange={(e) => setLeadBrief(e.target.value)}
        />
        <p className="field-hint">
          Dale al lead datos concretos para que responda con coherencia cuando el agente le
          pida detalles, en vez de improvisar y quedar fuera de perfil. No se comparte con el
          agente bajo prueba.
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

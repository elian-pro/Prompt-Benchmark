"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import type { RunListItem } from "@/lib/db/runs";
import { PRESET_LABELS } from "@/lib/prompts/adversarial-personas";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { NewRunModal } from "@/components/adversarial/NewRunModal";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  completed: "Completada",
  stopped: "Detenida",
  error: "Error",
};

export default function AdversarialPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setRuns(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las pruebas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty = !loading && runs.length === 0;

  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Adversarial Lab</h1>
          <p className="section-label library-subtitle">
            {runs.length} {runs.length === 1 ? "prueba" : "pruebas"}
          </p>
        </div>
        <div className="header-actions">
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setNewOpen(true)}
          >
            Nueva prueba
          </Button>
        </div>
      </div>

      {loading && <p className="empty-hint">Cargando…</p>}
      {error && <p className="form-error">{error}</p>}

      {isEmpty && (
        <div className="empty-hint">
          <p className="section-label">No hay pruebas todavía</p>
          <p style={{ marginTop: 8, marginBottom: 16 }}>
            Lanza una prueba adversaria: un lead simulado conversa con el prompt
            de un cliente y un juez reporta dónde falla.
          </p>
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setNewOpen(true)}
          >
            Nueva prueba
          </Button>
        </div>
      )}

      {!loading && !error && !isEmpty && (
        <div className="session-list">
          {runs.map((r) => (
            <Link key={r.id} href={`/adversarial/${r.id}`} className="session-item">
              <span className="session-main">
                <span className="session-client">{r.client_name ?? "Cliente eliminado"}</span>
                <span className="session-title">
                  {PRESET_LABELS[r.preset]} · intensidad {r.intensity} ·{" "}
                  {r.version_number_snapshot}
                </span>
              </span>
              <span className="session-meta">
                <span className={`session-status status-${r.status}`}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                <span className="muted">{relativeTimeEs(r.created_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {newOpen && <NewRunModal open={newOpen} onClose={() => setNewOpen(false)} />}
    </div>
  );
}

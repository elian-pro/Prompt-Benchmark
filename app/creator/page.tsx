"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconPlus, IconSparkles } from "@tabler/icons-react";
import type { ChatSessionListItem } from "@/lib/db/chat-sessions";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewCreatorSessionModal } from "@/components/creator/NewCreatorSessionModal";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  finalized: "Finalizada",
  abandoned: "Descartada",
};

export default function CreatorPage() {
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat-sessions?type=creator");
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSessions(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las sesiones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty = !loading && sessions.length === 0;

  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Creator</h1>
          <p className="section-label library-subtitle">
            {sessions.length} {sessions.length === 1 ? "sesión" : "sesiones"}
          </p>
        </div>
        <div className="header-actions">
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setNewOpen(true)}
          >
            Nueva creación
          </Button>
        </div>
      </div>

      {loading && <p className="empty-hint">Cargando…</p>}
      {error && <p className="form-error">{error}</p>}

      {isEmpty && (
        <EmptyState
          icon={<IconSparkles size={32} stroke={1.5} />}
          title="No hay sesiones de creación todavía"
          description="Abre una creación para construir un prompt nuevo con Claude Opus a partir de un prompt base como referencia y el brief del cliente."
          action={
            <Button
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setNewOpen(true)}
            >
              Nueva creación
            </Button>
          }
        />
      )}

      {!loading && !error && !isEmpty && (
        <div className="session-list">
          {sessions.map((s) => (
            <Link key={s.id} href={`/creator/${s.id}`} className="session-item">
              <span className="session-main">
                <span className="session-client">
                  {s.client_name ?? s.title ?? "Creación nueva"}
                </span>
                {s.client_name && s.title && (
                  <span className="session-title">{s.title}</span>
                )}
              </span>
              <span className="session-meta">
                <span className={`session-status status-${s.status}`}>
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
                <span className="muted">{relativeTimeEs(s.updated_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {newOpen && (
        <NewCreatorSessionModal open={newOpen} onClose={() => setNewOpen(false)} />
      )}
    </div>
  );
}

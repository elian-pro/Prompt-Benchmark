"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconMessage2, IconPlus } from "@tabler/icons-react";
import type { DemoSessionListItem } from "@/lib/db/demo-sessions";
import { relativeTimeEs } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { NewPlaygroundSessionModal } from "@/components/playground/NewPlaygroundSessionModal";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  sent_to_editor: "Enviada al Editor",
};

export default function PlaygroundPage() {
  const [sessions, setSessions] = useState<DemoSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-sessions");
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSessions(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las conversaciones.");
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
          <Link href="/lab" className="back-link">
            <IconArrowLeft size={13} /> Lab
          </Link>
          <h1 className="library-title">Playground</h1>
          <p className="section-label library-subtitle">
            {sessions.length} {sessions.length === 1 ? "conversación" : "conversaciones"}
          </p>
        </div>
        <div className="header-actions">
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setNewOpen(true)}
          >
            Nueva conversación
          </Button>
        </div>
      </div>

      {loading && <SkeletonRows count={4} />}
      {error && <p className="form-error">{error}</p>}

      {isEmpty && (
        <EmptyState
          icon={<IconMessage2 size={32} stroke={1.5} />}
          title="No hay conversaciones todavía"
          description="Conversa tú mismo con el prompt de un cliente, como un lead real, para probarlo en vivo."
          action={
            <Button
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setNewOpen(true)}
            >
              Nueva conversación
            </Button>
          }
        />
      )}

      {!loading && !error && !isEmpty && (
        <div className="session-list">
          {sessions.map((s) => (
            <Link key={s.id} href={`/lab/playground/${s.id}`} className="session-item">
              <span className="session-main">
                <span className="session-client">{s.client_name ?? "Cliente eliminado"}</span>
                <span className="session-title">
                  {s.version_number_snapshot} · {s.message_count}{" "}
                  {s.message_count === 1 ? "mensaje" : "mensajes"}
                </span>
              </span>
              <span className="session-meta">
                <span
                  className={`session-status status-${s.status === "active" ? "active" : "finalized"}`}
                >
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
                <span className="muted">{relativeTimeEs(s.created_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {newOpen && <NewPlaygroundSessionModal open={newOpen} onClose={() => setNewOpen(false)} />}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import type { ChatSessionListItem } from "@/lib/db/chat-sessions";
import { relativeTimeEs } from "@/lib/format";
import { getGreeting, TEAM_NAME } from "@/lib/greeting";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ClientPicker } from "@/components/sessions/ClientPicker";

type Mode = "editor" | "creator";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  finalized: "Finalizada",
  abandoned: "Descartada",
};

// Decorative welcome chips only — non-interactive, just to set the tone.
const INSPIRATION: Record<Mode, string[]> = {
  editor: [
    "Ajustar el tono del bot",
    "Cambiar una cifra o dato",
    "Reforzar la calificación de leads",
    "Pulir el saludo inicial",
  ],
  creator: [
    "Construir desde un brief",
    "Adaptar un flujo a otro giro",
    "Un bot de bienvenida nuevo",
    "Calificar leads desde cero",
  ],
};

export function SessionLanding({ mode }: { mode: Mode }) {
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Computed after mount so the random/time-based greeting doesn't mismatch SSR.
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setGreeting(getGreeting(new Date()));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-sessions?type=${mode}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
      setSessions(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las sesiones.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="session-landing">
      <section className="landing-hero">
        {/* Until the greeting is computed, a non-breaking space reserves the
            line height. The team name is emphasized (bold + accent). */}
        <h1 className="landing-greeting">
          {greeting
            ? greeting
                .split(TEAM_NAME)
                .flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <span key={i} className="greeting-team">
                          {TEAM_NAME}
                        </span>,
                        part,
                      ],
                )
            : "\u00A0"}
        </h1>

        <ClientPicker mode={mode} />

        <div className="landing-inspiration" aria-hidden="true">
          {INSPIRATION[mode].map((text) => (
            <span key={text} className="inspiration-chip">
              <IconSparkles size={13} stroke={1.5} />
              {text}
            </span>
          ))}
        </div>
      </section>

      <section className="landing-history">
        <div className="landing-history-head">
          <span className="section-label">Historial · {sessions.length}</span>
        </div>

        {loading && <SkeletonRows count={3} />}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && sessions.length === 0 && (
          <p className="empty-hint">
            Aún no hay sesiones. Selecciona un cliente para empezar.
          </p>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="session-list">
            {sessions.map((s) => {
              const primary =
                mode === "editor"
                  ? s.client_name ?? "Cliente eliminado"
                  : s.client_name ?? s.title ?? "Creación nueva";
              const showTitle =
                mode === "editor"
                  ? Boolean(s.title)
                  : Boolean(s.client_name && s.title);
              return (
                <Link key={s.id} href={`/${mode}/${s.id}`} className="session-item">
                  <span className="session-main">
                    <span className="session-client">{primary}</span>
                    {showTitle && <span className="session-title">{s.title}</span>}
                  </span>
                  <span className="session-meta">
                    <span className={`session-status status-${s.status}`}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <span className="muted">{relativeTimeEs(s.updated_at)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

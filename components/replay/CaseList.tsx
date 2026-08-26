"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { relativeTimeEs } from "@/lib/format";
import { resError } from "@/lib/res-error";

/** The case as the list endpoint returns it: no snapshots. */
type CaseRow = {
  id: string;
  client_id: string;
  client_name: string;
  id_de_kommo: string | null;
  conversation_at: string | null;
  turno_index: number | null;
  turnos_marcados: number[];
  nota: string;
  resolved_version_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

/** Where the replay starts. The stored cut is null on cases filed before a
 *  lead-marked note counted as replayable; for those the earliest marked turn
 *  IS the cut (see replayCutFor), so the row says the same thing the case page
 *  does instead of "sin turno marcado". */
function turnLabel(kase: CaseRow): string {
  const cut = kase.turno_index ?? (kase.turnos_marcados.length > 0
    ? Math.min(...kase.turnos_marcados)
    : null);
  return cut == null ? "Sin turno marcado" : `Turno ${cut + 1}`;
}

/**
 * Every client's cases: who, what failed, how long ago.
 *
 * A row is a link and nothing else. Opening a case used to expand it in place,
 * which crammed a whole conversation and its replay into a list row; both live
 * on the case's own page now (`/lab/replay/caso/[id]`), where the real
 * conversation and the replay sit side by side.
 */
export function CaseList({
  onCount,
}: {
  /** Lets the page title carry the count, the way Playground does. */
  onCount?: (resolved: number, total: number) => void;
}) {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cases");
      if (!res.ok) throw new Error(await resError(res, "No se pudieron cargar los casos."));
      const data = await res.json();
      setCases(data.cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (cases) onCount?.(cases.filter((c) => c.resolved_at).length, cases.length);
  }, [cases, onCount]);

  if (error) return <p className="form-error">{error}</p>;
  if (cases === null) return <SkeletonRows count={3} />;

  if (cases.length === 0) {
    return (
      <EmptyState
        icon={<IconPlayerPlay size={32} stroke={1.5} />}
        title="Todavía no hay casos"
        description="Empieza por elegir un cliente y marcar una conversación que haya salido mal."
      />
    );
  }

  return (
    <div className="session-list">
      {cases.map((kase) => (
        <Link key={kase.id} href={`/lab/replay/caso/${kase.id}`} className="session-item">
          <span className="session-main">
            <span className="session-client">
              {kase.client_name}
              {kase.id_de_kommo && <span className="muted"> · Lead {kase.id_de_kommo}</span>}
            </span>
            <span className="session-title">
              {turnLabel(kase)} · {kase.nota}
            </span>
          </span>
          <span className="session-meta">
            <span
              className={`session-status status-${kase.resolved_at ? "completed" : "active"}`}
            >
              {kase.resolved_at ? "Ya pasa" : "Pendiente"}
            </span>
            <span className="muted">{relativeTimeEs(kase.created_at)}</span>
            <IconChevronRight size={15} />
          </span>
        </Link>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import type { ConversationTurn } from "@/lib/conversation-turns";
import { CaseReplayWorkspace } from "@/components/replay/CaseReplayWorkspace";
import { SkeletonRows } from "@/components/ui/Skeleton";

/** The case as its own endpoint returns it: the row plus the conversation it
 *  was filed against, already parsed into turns. */
type CaseDetail = {
  id: string;
  client_id: string;
  id_de_kommo: string | null;
  conversation_at: string | null;
  turnos_marcados: number[];
  turno_index: number | null;
  nota: string;
  resolved_version_id: string | null;
  resolved_at: string | null;
  created_at: string;
  turns: ConversationTurn[];
  source: "turnos" | "historial";
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One case, on its own page.
 *
 * It used to open as an accordion inside the case list, which put a whole
 * conversation and its replay inside a row: scroll within scroll, and the two
 * things being compared stacked instead of side by side. A case is a screen,
 * not a row.
 */
export default function CasePage() {
  const params = useParams();
  const caseId = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [kase, setCase] = useState<CaseDetail | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/cases/${caseId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Caso no encontrado.");
        return res.json();
      })
      .then(setCase)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el caso."));
  }, [caseId]);

  useEffect(() => {
    if (!kase) return;
    fetch(`/api/clients/${kase.client_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((client) => setClientName(client?.name ?? null))
      .catch(() => setClientName(null));
  }, [kase]);

  return (
    <div>
      <div className="library-header">
        <div>
          <Link href="/lab/replay" className="back-link">
            <IconArrowLeft size={14} /> Replay
          </Link>
          <h1 className="library-title">
            {kase?.id_de_kommo ? `Lead ${kase.id_de_kommo}` : "Caso"}
          </h1>
          <p className="section-label library-subtitle">
            {[clientName, kase?.conversation_at ? formatDate(kase.conversation_at) : null]
              .filter(Boolean)
              .join(" · ") || "Cargando…"}
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {!kase && !error && <SkeletonRows count={4} />}

      {kase && (
        <>
          <p className="case-note">{kase.nota}</p>
          <CaseReplayWorkspace
            caseId={kase.id}
            clientId={kase.client_id}
            turns={kase.turns}
            source={kase.source}
            markedTurns={kase.turnos_marcados}
            replayable={kase.turno_index != null}
            resolvedVersionId={kase.resolved_version_id}
            resolvedAt={kase.resolved_at}
          />
        </>
      )}
    </div>
  );
}

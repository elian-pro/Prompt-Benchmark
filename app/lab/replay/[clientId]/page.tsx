"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import type { Client } from "@/lib/db/clients";
import { ConversationHistory } from "@/components/library/ConversationHistory";
import { CaseList } from "@/components/library/CaseList";

/**
 * Replay for one client: browse the real conversations, mark the turn that
 * failed, and re-run the marked cases against a candidate version.
 *
 * The two halves are the two ends of the same loop, so they share a screen:
 * you file a case on the left and, once the prompt has been edited, you
 * confirm the fix on the right without changing sections.
 */
export default function ReplayClientPage() {
  const params = useParams();
  const clientId = Array.isArray(params.clientId)
    ? params.clientId[0]
    : (params.clientId as string);

  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Cliente no encontrado.");
        return res.json();
      })
      .then(setClient)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el cliente."));
  }, [clientId]);

  return (
    <div>
      <div className="library-header">
        <div>
          <Link href="/lab/replay" className="back-link">
            <IconArrowLeft size={14} /> Replay
          </Link>
          <h1 className="library-title">{client?.name ?? "…"}</h1>
          <p className="section-label library-subtitle">
            Marca el mensaje donde el bot falló y comprueba si tu cambio lo arregla
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {client && (
        <div className="replay-layout">
          <section>
            <h2 className="section-label">Conversaciones</h2>
            <ConversationHistory clientId={clientId} clientName={client.name} embedded />
          </section>
          <section>
            <h2 className="section-label">Casos</h2>
            <CaseList clientId={clientId} embedded />
          </section>
        </div>
      )}
    </div>
  );
}

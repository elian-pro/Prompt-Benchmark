"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft, IconMessages } from "@tabler/icons-react";
import type { Client } from "@/lib/db/clients";
import type { ConversationRow } from "@/lib/db/chats-history";
import { ConversationHistory } from "@/components/library/ConversationHistory";
import { ConversationTranscript } from "@/components/library/ConversationTranscript";
import { EmptyState } from "@/components/ui/EmptyState";

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
 * Filing a case for one client: the conversations on the left, the one you
 * picked open on the right.
 *
 * The transcript is not a modal on purpose. Finding the conversation that
 * failed usually takes several tries, and a dialog that has to be dismissed
 * between each one turns scanning into a chore.
 */
export default function ReplayClientPage() {
  const params = useParams();
  const clientId = Array.isArray(params.clientId)
    ? params.clientId[0]
    : (params.clientId as string);

  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConversationRow | null>(null);

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
            Abre la conversación que falló y marca el mensaje del problema
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {client && (
        <div className="replay-layout">
          <section>
            <h2 className="section-label">Conversaciones</h2>
            <ConversationHistory
              clientId={clientId}
              clientName={client.name}
              embedded
              onSelectRow={setSelected}
              selectedId={selected?.id ?? null}
            />
          </section>

          <section>
            {selected ? (
              <>
                <h2 className="section-label">
                  {selected.id_de_kommo ? `Lead ${selected.id_de_kommo}` : `Conversación #${selected.id}`}
                </h2>
                <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  {formatDate(selected.created_at)}
                  {selected.numero_de_mensajes != null
                    ? ` · ${selected.numero_de_mensajes} mensaje(s)`
                    : ""}
                </p>
                <ConversationTranscript row={selected} clientId={clientId} canFileCase />
              </>
            ) : (
              <EmptyState
                icon={<IconMessages size={22} />}
                title="Ninguna conversación abierta"
                description="Elige una de la lista para leerla y marcar dónde falló el bot."
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

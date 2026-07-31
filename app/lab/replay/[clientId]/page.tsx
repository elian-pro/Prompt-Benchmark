"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowLeft, IconList, IconMessages } from "@tabler/icons-react";
import type { Client } from "@/lib/db/clients";
import type { ConversationRow } from "@/lib/db/chats-history";
import { ConversationHistory } from "@/components/library/ConversationHistory";
import { ReplayWorkspace } from "@/components/replay/ReplayWorkspace";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

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
 * Filing cases on one client's conversations.
 *
 * Browsing and working are two moments, not one: while looking for the
 * conversation that failed the list is the screen, and once it is open the
 * list is in the way. So opening one folds the list into a button, and the
 * workspace gets the full width it needs for a transcript plus its notes.
 */
export default function ReplayClientPage() {
  const params = useParams();
  const clientId = Array.isArray(params.clientId)
    ? params.clientId[0]
    : (params.clientId as string);

  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConversationRow | null>(null);
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Cliente no encontrado.");
        return res.json();
      })
      .then(setClient)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar el cliente."));
  }, [clientId]);

  function openConversation(row: ConversationRow) {
    setSelected(row);
    setListOpen(false);
  }

  return (
    <div>
      <div className="library-header">
        <div>
          <Link href="/lab/replay" className="back-link">
            <IconArrowLeft size={14} /> Replay
          </Link>
          <h1 className="library-title">
            {selected
              ? selected.id_de_kommo
                ? `Lead ${selected.id_de_kommo}`
                : `Conversación #${selected.id}`
              : (client?.name ?? "…")}
          </h1>
          <p className="section-label library-subtitle">
            {selected
              ? `${client?.name} · ${formatDate(selected.created_at)}`
              : "Abre la conversación que falló y marca el mensaje del problema"}
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {/* Left aligned and above the columns, next to the one it folds. Shown
          in both directions: collapsing is what you do once you found the
          conversation, and reopening is what you do when it was not the one. */}
      {selected && (
        <div className="replay-toolbar">
          <Button variant="ghost" size="sm" onClick={() => setListOpen((v) => !v)}>
            <IconList size={15} />
            {listOpen ? "Ocultar conversaciones" : "Ver conversaciones"}
          </Button>
        </div>
      )}

      {client && (
        <div className={`replay-layout${listOpen ? "" : " is-collapsed"}`}>
          {listOpen && (
            <section>
              <ConversationHistory
                clientId={clientId}
                clientName={client.name}
                embedded
                onSelectRow={openConversation}
                selectedId={selected?.id ?? null}
              />
            </section>
          )}

          <section>
            {selected ? (
              <ReplayWorkspace clientId={clientId} row={selected} />
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

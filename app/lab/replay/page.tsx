"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconPlayerPlay } from "@tabler/icons-react";
import type { Client } from "@/lib/db/clients";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";

/**
 * Replay's client picker. Only clients with a connected history table appear:
 * without one there are no real conversations to work from, and sending the
 * user into an empty screen to find that out helps nobody.
 */
export default function ReplayIndexPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
        return res.json();
      })
      .then((data: Client[]) => setClients(data.filter((c) => c.chats_table)))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar los clientes."));
  }, []);

  return (
    <div>
      <div className="library-header">
        <div>
          <Link href="/lab" className="back-link">
            <IconArrowLeft size={14} /> Lab
          </Link>
          <h1 className="library-title">Replay</h1>
          <p className="section-label library-subtitle">
            Conversaciones reales que ya ocurrieron: encuentra la que falló,
            márcala y comprueba si tu cambio la arregla
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {!clients && !error && <SkeletonRows />}

      {clients?.length === 0 && (
        <EmptyState
          icon={<IconPlayerPlay size={22} />}
          title="Ningún cliente tiene historial conectado"
          description="Conecta la tabla de conversaciones de un cliente desde su ficha en Biblioteca."
        />
      )}

      <div className="lab-grid">
        {clients?.map((client) => (
          <Link key={client.id} href={`/lab/replay/${client.id}`} className="lab-card">
            <IconPlayerPlay size={28} stroke={1.5} className="lab-card-icon" />
            <span className="lab-card-title">{client.name}</span>
            <p className="lab-card-desc">{client.chats_table}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/db/clients";
import { Modal } from "@/components/ui/Modal";
import { resError } from "@/lib/res-error";

/**
 * Picks the client to file a case for. Only clients with a connected history
 * table appear: without one there are no real conversations to work from, and
 * sending someone into an empty screen to discover that helps nobody.
 */
export function NewCaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || clients !== null) return;
    fetch("/api/clients")
      .then(async (res) => {
        if (!res.ok) throw new Error(await resError(res, "Error al cargar."));
        return res.json();
      })
      .then((data: Client[]) => setClients(data.filter((c) => c.chats_table)))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar los clientes."));
  }, [open, clients]);

  const term = search.trim().toLowerCase();
  const shown = clients?.filter((c) => !term || c.name.toLowerCase().includes(term));

  return (
    <Modal open={open} onClose={onClose} title="¿De qué cliente es la conversación?">
      {error && <p className="form-error">{error}</p>}

      <input
        className="input"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar cliente…"
        aria-label="Buscar cliente"
      />

      {clients === null && !error && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Cargando…</p>
      )}

      {clients?.length === 0 && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Ningún cliente tiene historial conectado. Conecta su tabla de
          conversaciones desde su ficha en Biblioteca.
        </p>
      )}

      <div style={{ marginTop: 8 }}>
        {shown?.map((client) => (
          <button
            key={client.id}
            type="button"
            className="conversation-item"
            onClick={() => router.push(`/lab/replay/${client.id}`)}
          >
            <div className="row-between">
              <span style={{ fontSize: 13 }}>{client.name}</span>
              <span className="muted" style={{ fontSize: 11 }}>{client.chats_table}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

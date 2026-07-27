"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconMessages,
} from "@tabler/icons-react";
import type { ConversationRow } from "@/lib/db/chats-history";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { chatsTableName } from "@/lib/chats-table-name";

type Props = {
  clientId: string;
  /** Used to name the table the "Crear tabla" shortcut would create. */
  clientName: string;
};

type Page = {
  connected: boolean;
  table: string | null;
  rows: ConversationRow[];
  total: number;
  hasMore: boolean;
};

type ChatsTable = { table: string; rows: number };

const PAGE_SIZE = 20;

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
 * Collapsible "Historial de conversaciones" panel in the client detail sidebar.
 * Reads the client's real lead conversations from the second Supabase project
 * ("chats"), newest first, read-only. When the client has no history table
 * connected yet, shows a picker to connect one (persisted as clients.chats_table).
 * Lazy-loads on first open, like N8nSyncHistory.
 */
export function ConversationHistory({ clientId, clientName }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const suggestedTable = chatsTableName(clientName);

  const [page, setPage] = useState<Page | null>(null);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = chats DB not configured on the server (503); distinct from "connected: false".
  const [unconfigured, setUnconfigured] = useState(false);

  // Full-conversation modal.
  const [selected, setSelected] = useState<ConversationRow | null>(null);

  // Connect-a-table flow (disconnected clients / "Cambiar tabla").
  const [picking, setPicking] = useState(false);
  const [tables, setTables] = useState<ChatsTable[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [saving, setSaving] = useState(false);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnconfigured(false);
    try {
      const res = await fetch(`/api/clients/${clientId}/conversations?limit=${PAGE_SIZE}&offset=0`);
      if (res.status === 503) {
        setUnconfigured(true);
        setPage(null);
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cargar el historial.");
      const data: Page = await res.json();
      setPage(data);
      setRows(data.rows);
      setOffset(data.rows.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (open && page === null && !unconfigured && !loading && !error) loadFirstPage();
  }, [open, page, unconfigured, loading, error, loadFirstPage]);

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/conversations?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cargar más.");
      const data: Page = await res.json();
      setRows((prev) => [...prev, ...data.rows]);
      setOffset((prev) => prev + data.rows.length);
      setPage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * Provisioning retry: creates chats_<Cliente> and connects it. Idempotent
   * server-side (create if not exists, adopt when the table already exists).
   */
  async function createTable() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createChatsTable: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la tabla.");
      const step = data.provisioning?.chats;
      if (step && !step.ok) throw new Error(step.error);
      setPage(null);
      setRows([]);
      setOffset(0);
      await loadFirstPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCreating(false);
    }
  }

  async function openPicker() {
    setPicking(true);
    if (tables === null) {
      try {
        const res = await fetch("/api/chats-tables");
        if (!res.ok) throw new Error((await res.json()).error ?? "No se pudieron listar las tablas.");
        const data: { configured: boolean; tables: ChatsTable[] } = await res.json();
        if (!data.configured) setUnconfigured(true);
        setTables(data.tables);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado.");
      }
    }
  }

  async function connect() {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chats_table: chosen }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo conectar la tabla.");
      // Reset and reload the history for the newly connected table.
      setPicking(false);
      setChosen("");
      setPage(null);
      setRows([]);
      setOffset(0);
      await loadFirstPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const total = page?.total ?? 0;
  const connected = page?.connected ?? false;

  return (
    <div className="n8n-card">
      <button className="n8n-history-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        <IconMessages size={14} />
        <span>Historial de conversaciones</span>
        {connected && total > 0 && (
          <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {error && <p className="form-error">{error}</p>}

          {unconfigured && (
            <p className="muted" style={{ fontSize: 13 }}>
              La conexión con la base de historial no está configurada.
            </p>
          )}

          {!unconfigured && loading && (
            <p className="muted" style={{ fontSize: 13 }}>Cargando…</p>
          )}

          {/* Disconnected: offer to pick a chats_* table. */}
          {!unconfigured && !loading && page && !connected && !picking && (
            <EmptyState
              icon={<IconMessages size={22} />}
              title="Sin historial conectado"
              description="Este cliente aún no tiene una tabla de conversaciones asociada."
              action={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <Button size="sm" variant="primary" onClick={openPicker} disabled={creating}>
                    Conectar historial
                  </Button>
                  {suggestedTable && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={createTable}
                      disabled={creating}
                    >
                      {creating ? "Creando…" : `Crear tabla ${suggestedTable}`}
                    </Button>
                  )}
                </div>
              }
            />
          )}

          {/* Table picker (connect / change). */}
          {!unconfigured && picking && (
            <div style={{ display: "grid", gap: 8 }}>
              <label className="field-label">Tabla de historial</label>
              {tables === null ? (
                <p className="muted" style={{ fontSize: 13 }}>Cargando tablas…</p>
              ) : tables.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No hay tablas chats_* disponibles.</p>
              ) : (
                <select
                  className="select"
                  value={chosen}
                  onChange={(e) => setChosen(e.target.value)}
                >
                  <option value="">Selecciona una tabla…</option>
                  {tables.map((t) => (
                    <option key={t.table} value={t.table}>
                      {t.table} ({t.rows})
                    </option>
                  ))}
                </select>
              )}
              <div className="row-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPicking(false);
                    setChosen("");
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button size="sm" variant="primary" onClick={connect} disabled={saving || !chosen}>
                  {saving ? "Conectando…" : "Conectar"}
                </Button>
              </div>
            </div>
          )}

          {/* Connected: the conversation list. */}
          {!unconfigured && connected && !picking && (
            <div>
              {rows.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>Sin conversaciones todavía.</p>
              ) : (
                rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="conversation-item"
                    onClick={() => setSelected(r)}
                  >
                    <div className="row-between">
                      <span style={{ fontSize: 13 }}>
                        {r.id_de_kommo ? `Lead ${r.id_de_kommo}` : `Conversación #${r.id}`}
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                    {r.numero_de_mensajes != null && (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {r.numero_de_mensajes} mensaje(s)
                      </span>
                    )}
                  </button>
                ))
              )}

              {page?.hasMore && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{ width: "100%", marginTop: 8 }}
                >
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </Button>
              )}

              <button
                type="button"
                className="version-changes-link"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setChosen(page?.table ?? "");
                  openPicker();
                }}
              >
                Cambiar tabla
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Conversación · ${selected.id_de_kommo ? `Lead ${selected.id_de_kommo}` : `#${selected.id}`}`
            : ""
        }
      >
        {selected && (
          <>
            <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {formatDate(selected.created_at)}
              {selected.numero_de_mensajes != null
                ? ` · ${selected.numero_de_mensajes} mensaje(s)`
                : ""}
            </p>
            <pre className="version-view-content">
              {selected.historial?.trim() ? selected.historial : "(Sin contenido.)"}
            </pre>
          </>
        )}
      </Modal>
    </div>
  );
}

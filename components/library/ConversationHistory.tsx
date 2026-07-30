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
import { ConversationTranscript } from "./ConversationTranscript";

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

/** The filters as submitted, not as typed: the list only refetches when the
 *  user applies them. */
type Filters = { search: string; from: string; to: string; maxMessages: string };

const NO_FILTERS: Filters = { search: "", from: "", to: "", maxMessages: "" };

function hasFilters(f: Filters): boolean {
  return Boolean(f.search || f.from || f.to || f.maxMessages);
}

function historyQuery(offset: number, f: Filters): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (f.search) params.set("search", f.search);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.maxMessages) params.set("maxMessages", f.maxMessages);
  return params.toString();
}

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

  // Search and filters: `draft` is what the inputs hold, `applied` is what the
  // list is showing. Splitting them keeps typing from refetching on every key.
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);

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
      const res = await fetch(
        `/api/clients/${clientId}/conversations?${historyQuery(0, applied)}`,
      );
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
  }, [clientId, applied]);

  useEffect(() => {
    if (open && page === null && !unconfigured && !loading && !error) loadFirstPage();
  }, [open, page, unconfigured, loading, error, loadFirstPage]);

  /** Re-runs the query from page one. Clearing `page` is what the load effect
   *  watches, so this is also how the filter form submits. */
  function reload(next: Filters) {
    setApplied(next);
    setDraft(next);
    setPage(null);
    setRows([]);
    setOffset(0);
    setError(null);
  }

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/conversations?${historyQuery(offset, applied)}`,
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

          {/* Connected: search, filters, then the conversation list. */}
          {!unconfigured && connected && !picking && (
            <div>
              <form
                className="history-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  reload(draft);
                }}
              >
                <input
                  className="input"
                  type="search"
                  value={draft.search}
                  onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                  placeholder="Id de Kommo, id de conversación o texto…"
                  aria-label="Buscar en el historial"
                />
                <div className="history-filters-row">
                  <label className="field-label" htmlFor="hist-from">Desde</label>
                  <input
                    id="hist-from"
                    className="input"
                    type="date"
                    value={draft.from}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  />
                  <label className="field-label" htmlFor="hist-to">Hasta</label>
                  <input
                    id="hist-to"
                    className="input"
                    type="date"
                    value={draft.to}
                    onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  />
                  <select
                    className="select"
                    value={draft.maxMessages}
                    onChange={(e) => setDraft((d) => ({ ...d, maxMessages: e.target.value }))}
                    aria-label="Largo de la conversación"
                  >
                    <option value="">Cualquier largo</option>
                    <option value="2">Hasta 2 mensajes</option>
                    <option value="5">Hasta 5 mensajes</option>
                    <option value="10">Hasta 10 mensajes</option>
                  </select>
                </div>
                <div className="row-between">
                  {hasFilters(applied) ? (
                    <button
                      type="button"
                      className="version-changes-link"
                      onClick={() => reload(NO_FILTERS)}
                    >
                      Limpiar filtros
                    </button>
                  ) : (
                    <span />
                  )}
                  <Button size="sm" variant="secondary" type="submit" disabled={loading}>
                    {loading ? "Buscando…" : "Buscar"}
                  </Button>
                </div>
              </form>

              {rows.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  {hasFilters(applied)
                    ? "Ninguna conversación coincide con esos filtros."
                    : "Sin conversaciones todavía."}
                </p>
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
            <ConversationTranscript row={selected} clientId={clientId} />
          </>
        )}
      </Modal>
    </div>
  );
}

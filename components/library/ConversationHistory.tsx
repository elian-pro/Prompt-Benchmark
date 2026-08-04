"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconChevronDown,
  IconChevronRight,
  IconMessages,
} from "@tabler/icons-react";
import type { ConversationRow } from "@/lib/db/chats-history";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchableChip } from "@/components/ui/SearchableChip";
import { chatsTableName } from "@/lib/chats-table-name";
import { ConversationTranscript } from "./ConversationTranscript";

type Props = {
  clientId: string;
  /** Used to name the table the "Crear tabla" shortcut would create. */
  clientName: string;
  /** Rendered expanded and without the collapsible header, for the Replay
   *  page where browsing the history IS the screen rather than a sidebar
   *  aside. Also enables filing a case from a transcript. */
  embedded?: boolean;
  /**
   * When given, picking a conversation reports it instead of opening the
   * modal, and the caller renders it. Replay puts the transcript in its own
   * column, next to the list, so you can keep scanning without closing a
   * dialog every time.
   */
  onSelectRow?: (row: ConversationRow) => void;
  /** Which row the caller is currently showing, to mark it in the list. */
  selectedId?: number | null;
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

/** Anything hidden behind "Opciones avanzadas", so the collapsed header can
 *  say that a filter is active without opening it. */
function hasAdvanced(f: Filters): boolean {
  return Boolean(f.from || f.to || f.maxMessages);
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
export function ConversationHistory({
  clientId,
  clientName,
  embedded = false,
  onSelectRow,
  selectedId = null,
}: Props) {
  const [open, setOpen] = useState(embedded);
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

  // `filters` is what the inputs hold and `applied` is what the list is
  // showing: the gap between them is the debounce, so typing an id narrows the
  // list on its own instead of waiting for a button.
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  /** Bumped to re-run the query without changing the filters, after the
   *  history table is connected or created. */
  const [refreshKey, setRefreshKey] = useState(0);
  const [advanced, setAdvanced] = useState(false);

  // Connect-a-table flow (disconnected clients / "Cambiar tabla").
  const [picking, setPicking] = useState(false);
  const [tables, setTables] = useState<ChatsTable[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [saving, setSaving] = useState(false);

  const SEARCH_DEBOUNCE_MS = 300;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setApplied(filters), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters, open]);

  /**
   * Loads page one whenever the applied filters change.
   *
   * Two things it deliberately does NOT do: clear `rows` first, so the list
   * stays readable while the next page is in flight instead of blinking empty
   * on every keystroke; and trust a response that arrived late. With a search
   * running per keystroke, a slow early request can resolve after a fast later
   * one and repaint stale results, so anything but the newest is dropped.
   */
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/clients/${clientId}/conversations?${historyQuery(0, applied)}`,
        );
        if (!current) return;
        if (res.status === 503) {
          setUnconfigured(true);
          setPage(null);
          return;
        }
        if (!res.ok) {
          throw new Error((await res.json()).error ?? "No se pudo cargar el historial.");
        }
        const data: Page = await res.json();
        if (!current) return;
        setUnconfigured(false);
        setPage(data);
        setRows(data.rows);
        setOffset(data.rows.length);
      } catch (e) {
        if (current) setError(e instanceof Error ? e.message : "Error inesperado.");
      } finally {
        if (current) setLoading(false);
      }
    })();

    return () => {
      current = false;
    };
  }, [open, applied, clientId, refreshKey]);

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
      setRefreshKey((k) => k + 1);
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
      // Reload the history for the newly connected table.
      setPicking(false);
      setChosen("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  const total = page?.total ?? 0;
  const connected = page?.connected ?? false;

  return (
    <div className={embedded ? "" : "n8n-card"}>
      {!embedded && (
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
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          {error && <p className="form-error">{error}</p>}

          {unconfigured && (
            <p className="muted" style={{ fontSize: 13 }}>
              La conexión con la base de historial no está configurada.
            </p>
          )}

          {/* Only the very first load takes over the panel. Later searches
              keep the list on screen and report themselves in the filter row,
              so typing does not blank the view on every keystroke. */}
          {!unconfigured && loading && page === null && (
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
              {/* Same picker the n8n binding modal uses: 16 tables named alike
                  are hard to spot in a native select, and this one filters as
                  you type and looks like the rest of the app. */}
              <SearchableChip
                icon={<IconMessages size={13} />}
                placeholder="Elige una tabla"
                searchPlaceholder="Buscar tabla por nombre…"
                items={(tables ?? []).map((t) => ({
                  id: t.table,
                  label: t.table,
                  meta: `${t.rows} conversaciones`,
                }))}
                value={chosen}
                onChange={setChosen}
                loading={tables === null}
                emptyText="No hay tablas chats_* disponibles."
              />
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
              <div className="history-filters">
                <input
                  className="input"
                  type="search"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Id de Kommo, id de conversación o texto…"
                  aria-label="Buscar en el historial"
                />

                <div className="row-between">
                  <button
                    type="button"
                    className="version-changes-link"
                    aria-expanded={advanced}
                    onClick={() => setAdvanced((v) => !v)}
                  >
                    {advanced ? "Ocultar opciones" : "Opciones avanzadas"}
                    {!advanced && hasAdvanced(filters) ? " ·" : ""}
                  </button>
                  {loading ? (
                    <span className="muted" style={{ fontSize: 11 }}>Buscando…</span>
                  ) : hasFilters(applied) ? (
                    <button
                      type="button"
                      className="version-changes-link"
                      onClick={() => setFilters(NO_FILTERS)}
                    >
                      Limpiar
                    </button>
                  ) : (
                    <span />
                  )}
                </div>

                {advanced && (
                  <div className="history-filters-row">
                    <label className="field-label" htmlFor="hist-from">Desde</label>
                    <input
                      id="hist-from"
                      className="input"
                      type="date"
                      value={filters.from}
                      onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                    />
                    <label className="field-label" htmlFor="hist-to">Hasta</label>
                    <input
                      id="hist-to"
                      className="input"
                      type="date"
                      value={filters.to}
                      onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    />
                    <select
                      className="select"
                      value={filters.maxMessages}
                      onChange={(e) => setFilters((f) => ({ ...f, maxMessages: e.target.value }))}
                      aria-label="Largo de la conversación"
                    >
                      <option value="">Cualquier largo</option>
                      <option value="2">Hasta 2 mensajes</option>
                      <option value="5">Hasta 5 mensajes</option>
                      <option value="10">Hasta 10 mensajes</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Silent while a search is in flight: saying "no matches" over
                  a half-typed id is noise, and the previous rows are still on
                  screen anyway. */}
              {rows.length === 0 ? (
                loading ? null : (
                  <p className="muted" style={{ fontSize: 13 }}>
                    {hasFilters(applied)
                      ? "Ninguna conversación coincide con esos filtros."
                      : "Sin conversaciones todavía."}
                  </p>
                )
              ) : (
                rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`conversation-item${selectedId === r.id ? " is-selected" : ""}`}
                    onClick={() => (onSelectRow ? onSelectRow(r) : setSelected(r))}
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

              <div className="row-between" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="version-changes-link"
                  onClick={() => {
                    setChosen(page?.table ?? "");
                    openPicker();
                  }}
                >
                  Cambiar tabla
                </button>
                {/* Filing a case and replaying it live in Lab; this panel is
                    reference material. */}
                {!embedded && (
                  <Link className="version-changes-link" href={`/lab/replay/${clientId}`}>
                    Abrir en Replay
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Only when the caller does not render the transcript itself. */}
      {!onSelectRow && (
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
              <ConversationTranscript row={selected} />
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

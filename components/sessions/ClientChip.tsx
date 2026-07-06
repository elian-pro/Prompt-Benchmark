"use client";

import { useEffect, useState } from "react";
import { IconChevronDown, IconSearch, IconTargetArrow } from "@tabler/icons-react";
import type { ClientSummary } from "@/lib/db/clients";

export type ClientChipValue =
  | { kind: "client"; id: string; name: string }
  | { kind: "scratch" }
  | null;

type Mode = "editor" | "creator";

/**
 * Small inline chip that opens a searchable client list — the equivalent of
 * picking a branch/repo in Claude Code's composer. Selecting an item commits
 * immediately (no separate confirm step): the real "confirm" is sending the
 * first message. Locks once `disabled` (the conversation already started).
 */
export function ClientChip({
  mode,
  value,
  onChange,
  disabled,
}: {
  mode: Mode;
  value: ClientChipValue;
  onChange: (next: ClientChipValue) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Lazy-load the client list the first time the panel opens.
  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    setError(null);
    fetch("/api/clients?filter=all")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
        return res.json();
      })
      .then((data: ClientSummary[]) => {
        setClients(data);
        setLoaded(true);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error al cargar los clientes."),
      )
      .finally(() => setLoading(false));
  }, [open, loaded]);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? clients.filter((c) =>
        [c.name, c.segment]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(term)),
      )
    : clients;

  const label =
    value?.kind === "client"
      ? value.name
      : value?.kind === "scratch"
        ? "Desde cero"
        : mode === "editor"
          ? "Selecciona un cliente"
          : "Selecciona un prompt base";

  function pick(next: ClientChipValue) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="chip-select">
      <button
        type="button"
        className={`chip-select-trigger${value ? " is-set" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
      >
        <IconTargetArrow size={13} />
        <span>{label}</span>
        {!disabled && <IconChevronDown size={13} />}
      </button>

      {open && (
        <>
          <div className="chip-select-backdrop" onClick={() => setOpen(false)} />
          <div className="chip-select-panel" role="dialog" aria-label="Seleccionar cliente">
            <div className="chip-select-search">
              <IconSearch size={13} className="muted" />
              <input
                className="chip-select-search-input"
                placeholder="Buscar cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="chip-select-list">
              {mode === "creator" && (
                <button
                  type="button"
                  className={`chip-select-item${value?.kind === "scratch" ? " is-selected" : ""}`}
                  onClick={() => pick({ kind: "scratch" })}
                >
                  <span className="chip-select-item-name">Empezar desde cero</span>
                  <span className="chip-select-item-meta">Sin prompt de referencia</span>
                </button>
              )}

              {loading && <p className="chip-select-note">Cargando clientes…</p>}
              {error && <p className="chip-select-note">{error}</p>}
              {!loading && !error && filtered.length === 0 && (
                <p className="chip-select-note">Sin clientes.</p>
              )}
              {!loading &&
                !error &&
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip-select-item${
                      value?.kind === "client" && value.id === c.id ? " is-selected" : ""
                    }`}
                    onClick={() => pick({ kind: "client", id: c.id, name: c.name })}
                  >
                    <span className="chip-select-item-name">{c.name}</span>
                    <span className="chip-select-item-meta">
                      {[c.segment, c.production_version_number ?? c.latest_version_number]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

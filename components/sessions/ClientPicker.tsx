"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconSearch, IconTargetArrow } from "@tabler/icons-react";
import type { ClientSummary, ClientDetail } from "@/lib/db/clients";
import { Button } from "@/components/ui/Button";

type Mode = "editor" | "creator";

/**
 * Yellow "select a client" entry point for the Editor/Creator landings —
 * replaces the old "Nueva edición / Nueva creación" button + modal. Pick a
 * client, then confirm to create the session and jump into the conversation
 * ("elegir y confirmar").
 *
 * - Editor: a client is required (its prompt is what you edit).
 * - Creator: the client is an architectural reference and is optional — you can
 *   also start from scratch.
 */
export function ClientPicker({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [scratch, setScratch] = useState(false);
  const [creating, setCreating] = useState(false);
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

  const selected = clients.find((c) => c.id === selectedId) ?? null;
  const term = search.trim().toLowerCase();
  const filtered = term
    ? clients.filter((c) =>
        [c.name, c.segment]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(term)),
      )
    : clients;

  const canConfirm = mode === "editor" ? Boolean(selectedId) : Boolean(selectedId) || scratch;

  const pillLabel = selected
    ? selected.name
    : scratch
      ? "Desde cero"
      : mode === "editor"
        ? "Selecciona un cliente"
        : "Selecciona un prompt base";

  const confirmLabel =
    mode === "editor"
      ? "Abrir edición"
      : selectedId
        ? "Empezar con referencia"
        : "Empezar desde cero";

  async function loadDetail(id: string): Promise<ClientDetail> {
    const res = await fetch(`/api/clients/${id}`);
    if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cargar el cliente.");
    return res.json();
  }

  async function confirm() {
    if (!canConfirm || creating) return;
    setCreating(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === "editor") {
        const detail = await loadDetail(selectedId);
        const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
        if (!baseVersionId) throw new Error("El cliente no tiene ninguna versión base.");
        body = { clientId: selectedId, baseVersionId };
      } else if (selectedId) {
        const detail = await loadDetail(selectedId);
        const baseVersionId = detail.production_version?.id ?? detail.versions[0]?.id;
        if (!baseVersionId) throw new Error("El prompt de referencia no tiene ninguna versión.");
        body = { type: "creator", baseVersionId, title: `Basado en ${detail.name}` };
      } else {
        body = { type: "creator" };
      }

      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo crear la sesión.");
      const session = await res.json();
      router.push(`/${mode}/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setCreating(false);
    }
  }

  return (
    <div className="client-picker">
      <button
        type="button"
        className="client-pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <IconTargetArrow size={16} />
        <span>{pillLabel}</span>
        <IconChevronDown size={16} />
      </button>

      {open && (
        <>
          <div className="picker-backdrop" onClick={() => setOpen(false)} />
          <div className="picker-panel" role="dialog" aria-label="Seleccionar cliente">
            <div className="picker-search">
              <IconSearch size={15} className="muted" />
              <input
                className="picker-search-input"
                placeholder="Buscar cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="picker-list">
              {mode === "creator" && (
                <button
                  type="button"
                  className={`picker-item${scratch ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedId("");
                    setScratch(true);
                  }}
                >
                  <span className="picker-item-name">Empezar desde cero</span>
                  <span className="picker-item-meta">Sin prompt de referencia</span>
                </button>
              )}

              {loading && <p className="picker-note">Cargando clientes…</p>}
              {!loading && filtered.length === 0 && (
                <p className="picker-note">Sin clientes.</p>
              )}
              {!loading &&
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`picker-item${selectedId === c.id ? " selected" : ""}`}
                    onClick={() => {
                      setSelectedId(c.id);
                      setScratch(false);
                    }}
                  >
                    <span className="picker-item-name">{c.name}</span>
                    <span className="picker-item-meta">
                      {[c.segment, c.production_version_number ?? c.latest_version_number]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </button>
                ))}
            </div>

            <div className="picker-foot">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirm}
                disabled={!canConfirm || creating}
              >
                {creating ? "Abriendo…" : confirmLabel}
              </Button>
            </div>
          </div>
        </>
      )}

      {error && <p className="form-error picker-error">{error}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconPlus, IconUpload, IconLibrary } from "@tabler/icons-react";
import type { ClientSummary, ClientFilter } from "@/lib/db/clients";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ClientCard } from "@/components/library/ClientCard";
import { NewClientModal } from "@/components/library/NewClientModal";
import { ImportModal } from "@/components/library/ImportModal";
import { DeleteClientModal } from "@/components/library/DeleteClientModal";

const FILTERS: { key: ClientFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "production", label: "Producción" },
  { key: "editing", label: "En edición" },
  { key: "legacy", label: "Legacy" },
  { key: "archived", label: "Archivados" },
];

function matches(c: ClientSummary, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return [c.name, c.segment]
    .filter(Boolean)
    .some((v) => (v as string).toLowerCase().includes(t));
}

export default function LibraryPage() {
  const [nonArchived, setNonArchived] = useState<ClientSummary[]>([]);
  const [archived, setArchived] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ClientFilter>("all");
  const [search, setSearch] = useState("");

  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, arRes] = await Promise.all([
        fetch("/api/clients?filter=all"),
        fetch("/api/clients?filter=archived"),
      ]);
      if (!aRes.ok) throw new Error((await aRes.json()).error ?? "Error al cargar.");
      if (!arRes.ok) throw new Error((await arRes.json()).error ?? "Error al cargar.");
      setNonArchived(await aRes.json());
      setArchived(await arRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  const sNon = useMemo(
    () => nonArchived.filter((c) => matches(c, search)),
    [nonArchived, search],
  );
  const sArch = useMemo(
    () => archived.filter((c) => matches(c, search)),
    [archived, search],
  );

  const counts: Record<ClientFilter, number> = {
    all: sNon.length,
    production: sNon.filter((c) => c.production_version_number !== null).length,
    editing: sNon.filter((c) => c.production_version_number === null).length,
    legacy: sNon.filter((c) => c.is_legacy).length,
    archived: sArch.length,
  };

  const displayed = useMemo(() => {
    switch (filter) {
      case "archived":
        return sArch;
      case "production":
        return sNon.filter((c) => c.production_version_number !== null);
      case "editing":
        return sNon.filter((c) => c.production_version_number === null);
      case "legacy":
        return sNon.filter((c) => c.is_legacy);
      default:
        return sNon;
    }
  }, [filter, sNon, sArch]);

  const totalVersions = useMemo(
    () =>
      [...nonArchived, ...archived].reduce((sum, c) => sum + c.version_count, 0),
    [nonArchived, archived],
  );

  const isEmpty = !loading && nonArchived.length === 0 && archived.length === 0;

  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Biblioteca</h1>
          <p className="section-label library-subtitle">
            {nonArchived.length} clientes · {totalVersions} versiones ·{" "}
            {archived.length} archivados
          </p>
        </div>
        <div className="header-actions">
          <Button
            variant="secondary"
            icon={<IconUpload size={14} />}
            onClick={() => setImportOpen(true)}
          >
            Importar existente
          </Button>
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setNewOpen(true)}
          >
            Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="library-search">
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o segmento…"
        />
      </div>

      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip${filter === f.key ? " active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="chip-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {loading && <SkeletonCards count={6} />}
      {error && <p className="form-error">{error}</p>}

      {isEmpty && (
        <EmptyState
          icon={<IconLibrary size={32} stroke={1.5} />}
          title="No hay clientes todavía"
          description="Importa uno existente o crea uno nuevo para empezar."
          action={
            <Button
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setNewOpen(true)}
            >
              Nuevo cliente
            </Button>
          }
        />
      )}

      {!loading && !error && !isEmpty && (
        <div className="client-grid">
          {displayed.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              onDelete={setDeleteTarget}
              onToast={showToast}
            />
          ))}
        </div>
      )}

      {newOpen && <NewClientModal open={newOpen} onClose={() => setNewOpen(false)} />}
      {importOpen && (
        <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      )}
      {deleteTarget && (
        <DeleteClientModal
          client={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

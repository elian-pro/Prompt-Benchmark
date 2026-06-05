"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import type { MaskedProvider } from "@/lib/db/providers";
import type { RoleDefault } from "@/lib/db/role-defaults";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProviderFormModal } from "@/components/settings/ProviderFormModal";
import { ProviderRow } from "@/components/settings/ProviderRow";
import { RoleAssignments } from "@/components/settings/RoleAssignments";

export default function SettingsPage() {
  const [providers, setProviders] = useState<MaskedProvider[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<RoleDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaskedProvider | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<MaskedProvider | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/role-defaults"),
      ]);
      if (!pRes.ok) throw new Error((await pRes.json()).error ?? "Error al cargar proveedores.");
      if (!rRes.ok) throw new Error((await rRes.json()).error ?? "Error al cargar roles.");
      setProviders(await pRes.json());
      setRoleDefaults(await rRes.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(provider: MaskedProvider) {
    setEditing(provider);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/providers/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar el proveedor.");
      }
      setDeleteTarget(null);
      load();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24 }}>Configuración</h1>

      <section className="settings-section">
        <div className="settings-section-header">
          <span className="section-label">Proveedores</span>
          <Button
            variant="secondary"
            icon={<IconPlus size={14} />}
            onClick={openCreate}
          >
            Agregar proveedor
          </Button>
        </div>

        {loading && <p className="empty-hint">Cargando…</p>}
        {loadError && <p className="form-error">{loadError}</p>}

        {!loading && !loadError && providers.length === 0 && (
          <p className="empty-hint">
            No hay proveedores todavía. Agrega uno para empezar.
          </p>
        )}

        <div className="provider-list">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              onEdit={openEdit}
              onDelete={(prov) => {
                setDeleteError(null);
                setDeleteTarget(prov);
              }}
              onChanged={load}
            />
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <span className="section-label">Asignación de roles</span>
        </div>
        {!loading && !loadError && (
          <RoleAssignments
            providers={providers}
            roleDefaults={roleDefaults}
            onSaved={load}
          />
        )}
      </section>

      {formOpen && (
        <ProviderFormModal
          open={formOpen}
          provider={editing}
          onClose={() => setFormOpen(false)}
          onSaved={load}
        />
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={`Eliminar "${deleteTarget?.name ?? ""}"`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </>
        }
      >
        <p className="muted" style={{ fontSize: 14 }}>
          Se eliminará el proveedor y todos sus modelos. Esta acción no se puede
          deshacer.
        </p>
        {deleteError && <p className="form-error">{deleteError}</p>}
      </Modal>
    </div>
  );
}

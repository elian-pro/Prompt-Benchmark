"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPlus, IconServer } from "@tabler/icons-react";
import type { MaskedProvider } from "@/lib/db/providers";
import type { RoleDefault } from "@/lib/db/role-defaults";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
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

  async function confirmDelete(target: MaskedProvider) {
    const res = await fetch(`/api/providers/${target.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo eliminar el proveedor.");
    }
    setDeleteTarget(null);
    load();
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
          <EmptyState
            icon={<IconServer size={32} stroke={1.5} />}
            title="No hay proveedores todavía"
            description="Agrega un proveedor de LLM para configurar sus modelos y asignarlos a roles."
            action={
              <Button
                variant="primary"
                icon={<IconPlus size={14} />}
                onClick={openCreate}
              >
                Agregar proveedor
              </Button>
            }
          />
        )}

        <div className="provider-list">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              onEdit={openEdit}
              onDelete={(prov) => setDeleteTarget(prov)}
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

      {deleteTarget && (
        <DangerConfirmModal
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => confirmDelete(deleteTarget)}
          warning={{
            title: `¿Eliminar "${deleteTarget.name}"?`,
            body: "Se eliminará el proveedor junto con su clave y todos sus modelos.",
          }}
          consequences={[
            `Se eliminará el proveedor y sus ${deleteTarget.models.length} modelos.`,
            "Tendrás que volver a pegar la clave si lo agregas de nuevo.",
            "Esta acción no se puede deshacer.",
          ]}
          confirmPhrase={deleteTarget.name}
        />
      )}
    </div>
  );
}

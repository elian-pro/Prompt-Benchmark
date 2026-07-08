"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPlus, IconServer } from "@tabler/icons-react";
import type { MaskedProvider } from "@/lib/db/providers";
import type { RoleDefault } from "@/lib/db/role-defaults";
import type { PromptOverride } from "@/lib/db/prompt-overrides";
import { Button } from "@/components/ui/Button";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { DangerConfirmModal } from "@/components/ui/DangerConfirmModal";
import { ProviderFormModal } from "@/components/settings/ProviderFormModal";
import { ProviderRow } from "@/components/settings/ProviderRow";
import { RoleAssignments } from "@/components/settings/RoleAssignments";
import { SystemPromptCard } from "@/components/settings/SystemPromptCard";
import { EDITOR_PERSONA } from "@/lib/prompts/editor-persona";
import { CREATOR_PERSONA } from "@/lib/prompts/creator-persona";
import { buildJudgeSystemPrompt } from "@/lib/prompts/judge";

export default function SettingsPage() {
  const [providers, setProviders] = useState<MaskedProvider[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<RoleDefault[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaskedProvider | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<MaskedProvider | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pRes, rRes, oRes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/role-defaults"),
        fetch("/api/prompt-overrides"),
      ]);
      if (!pRes.ok) throw new Error((await pRes.json()).error ?? "Error al cargar proveedores.");
      if (!rRes.ok) throw new Error((await rRes.json()).error ?? "Error al cargar roles.");
      if (!oRes.ok) throw new Error((await oRes.json()).error ?? "Error al cargar los prompts.");
      setProviders(await pRes.json());
      setRoleDefaults(await rRes.json());
      const overrideRows: PromptOverride[] = await oRes.json();
      setOverrides(
        Object.fromEntries(overrideRows.map((o) => [o.role, o.content])),
      );
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

      <CollapsibleCard
        title="Proveedores"
        hint={
          loading
            ? undefined
            : `${providers.length} ${providers.length === 1 ? "proveedor" : "proveedores"}`
        }
        actions={
          <Button
            variant="secondary"
            icon={<IconPlus size={14} />}
            onClick={openCreate}
          >
            Agregar proveedor
          </Button>
        }
      >
        {loading && <SkeletonRows count={3} />}
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
      </CollapsibleCard>

      <CollapsibleCard title="Asignación de roles">
        {loading && <SkeletonRows count={3} />}
        {!loading && !loadError && (
          <RoleAssignments
            providers={providers}
            roleDefaults={roleDefaults}
            onSaved={load}
          />
        )}
      </CollapsibleCard>

      <p className="section-label settings-group-label">System prompts</p>

      {loading && <SkeletonRows count={3} />}
      {!loading && !loadError && (
        <>
          <SystemPromptCard
            role="editor"
            title="Editor · ingeniero de prompts"
            description="Persona del chat del Editor. En tiempo real, la app le anexa al final el prompt del cliente que se está editando."
            defaultText={EDITOR_PERSONA}
            savedContent={overrides.editor ?? null}
            onToast={showToast}
          />
          <SystemPromptCard
            role="creator"
            title="Creator · arquitecto de prompts"
            description="Persona del chat del Creator. En tiempo real, la app le anexa al final el prompt base elegido como referencia de arquitectura."
            defaultText={CREATOR_PERSONA}
            savedContent={overrides.creator ?? null}
            onToast={showToast}
          />
          <SystemPromptCard
            role="judge"
            title="Juez · IA vs IA"
            description="Evalúa la conversación completa entre el lead simulado y el bot, y produce el reporte estructurado de fallas. La app lo usa tal cual (no anexa nada más)."
            defaultText={buildJudgeSystemPrompt()}
            savedContent={overrides.judge ?? null}
            onToast={showToast}
          />
        </>
      )}

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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

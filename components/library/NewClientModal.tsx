"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SegmentPicker } from "@/components/library/SegmentPicker";
import { BindOnCreateToggle } from "@/components/library/BindOnCreateToggle";
import { N8nHostPicker } from "@/components/library/N8nHostPicker";
import { ProvisionFields, type ProvisionChoice } from "@/components/library/ProvisionFields";
import type { N8nHost } from "@/lib/db/clients";

type StepResult =
  | { ok: true; detail: string }
  | { ok: false; error: string; pick?: { connectionId: string; workflowId: string } };
type Provisioning = { workflow: StepResult | null; chats: StepResult | null };

export function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [notes, setNotes] = useState("");
  const [n8nHost, setN8nHost] = useState<N8nHost>("zebra");
  const [bindAfter, setBindAfter] = useState(false);
  const [provision, setProvision] = useState<ProvisionChoice>({
    duplicateWorkflow: true,
    createChatsTable: true,
    template: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only when the client was created but a provisioning step failed: the
  // modal stays open to report it instead of navigating away silently.
  const [report, setReport] = useState<{ clientId: string; provisioning: Provisioning } | null>(
    null,
  );

  function goToClient(clientId: string, bind: boolean) {
    router.push(`/library/${clientId}${bind ? "?bind=1" : ""}`);
  }

  /** Opens the client's binding picker already on the duplicated workflow. */
  function goPickNode(clientId: string, pick: { connectionId: string; workflowId: string }) {
    router.push(
      `/library/${clientId}?bind=1&conn=${encodeURIComponent(pick.connectionId)}&wf=${encodeURIComponent(pick.workflowId)}`,
    );
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          segment: segment.trim() || null,
          notes: notes.trim() || null,
          n8nHost,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo crear el cliente.");
      }
      const { client } = await res.json();

      const wantsProvisioning = provision.duplicateWorkflow || provision.createChatsTable;
      if (!wantsProvisioning) {
        goToClient(client.id, bindAfter);
        return;
      }

      // The client exists from here on, so nothing below may cancel it: a
      // failure is reported and the user continues to the client's page.
      let provisioning: Provisioning = { workflow: null, chats: null };
      try {
        const pRes = await fetch(`/api/clients/${client.id}/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            duplicateWorkflow: provision.duplicateWorkflow,
            createChatsTable: provision.createChatsTable,
            ...(provision.template
              ? {
                  templateConnectionId: provision.template.connectionId,
                  templateWorkflowId: provision.template.workflowId,
                }
              : {}),
          }),
        });
        const data = await pRes.json().catch(() => ({}));
        provisioning = pRes.ok
          ? data.provisioning
          : {
              workflow: provision.duplicateWorkflow
                ? { ok: false, error: data.error ?? "Falló el aprovisionamiento." }
                : null,
              chats: provision.createChatsTable
                ? { ok: false, error: data.error ?? "Falló el aprovisionamiento." }
                : null,
            };
      } catch {
        const failed: StepResult = { ok: false, error: "No se pudo contactar al servidor." };
        provisioning = {
          workflow: provision.duplicateWorkflow ? failed : null,
          chats: provision.createChatsTable ? failed : null,
        };
      }

      const failedSteps = [provisioning.workflow, provisioning.chats].filter(
        (s) => s && !s.ok,
      ).length;
      if (failedSteps === 0) {
        // Auto-binding covered the manual bind step, so skip the picker.
        goToClient(client.id, bindAfter && !provision.duplicateWorkflow);
        return;
      }
      setReport({ clientId: client.id, provisioning });
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setSaving(false);
    }
  }

  // Only the workflow step can leave a "choose the node" pending action.
  const workflowStep = report?.provisioning.workflow;
  const pendingPick = workflowStep && !workflowStep.ok ? workflowStep.pick : undefined;

  return (
    <Modal
      open={open}
      onClose={report ? () => goToClient(report.clientId, false) : onClose}
      title="Nuevo cliente"
      footer={
        report ? (
          pendingPick ? (
            <Button variant="primary" onClick={() => goPickNode(report.clientId, pendingPick)}>
              Elegir nodo
            </Button>
          ) : (
            <Button variant="primary" onClick={() => goToClient(report.clientId, false)}>
              Continuar
            </Button>
          )
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>
              {saving ? "Creando…" : "Crear"}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <>
          <p className="form-ok">El cliente se creó.</p>
          <StepLine label="Flujo de n8n" result={report.provisioning.workflow} />
          <StepLine label="Tabla de historial" result={report.provisioning.chats} />
          <p className="field-hint">
            {pendingPick
              ? "Continúa para elegir el nodo del flujo que ya se creó."
              : "Puedes reintentar lo que falló desde la ficha del cliente."}
          </p>
        </>
      ) : (
        <>
          <div className="field">
            <label className="field-label">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Segmento</label>
            <SegmentPicker value={segment} onChange={setSegment} />
          </div>
          <div className="field">
            <label className="field-label">Notas</label>
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <N8nHostPicker value={n8nHost} onChange={setN8nHost} />
          <ProvisionFields
            clientName={name}
            value={provision}
            onChange={setProvision}
            disabled={saving}
          />
          {!provision.duplicateWorkflow && (
            <BindOnCreateToggle checked={bindAfter} onChange={setBindAfter} />
          )}
          {error && <p className="form-error">{error}</p>}
        </>
      )}
    </Modal>
  );
}

function StepLine({ label, result }: { label: string; result: StepResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="form-ok">
      {label}: {result.detail}
    </p>
  ) : (
    <p className="form-error">
      {label}: {result.error}
    </p>
  );
}

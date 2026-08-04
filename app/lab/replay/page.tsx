"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { IconArrowLeft, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { CaseList } from "@/components/replay/CaseList";
import { NewCaseModal } from "@/components/replay/NewCaseModal";

/**
 * Replay opens on every client's cases, because the question you arrive with
 * is "what is still broken", not "what is broken for this one client".
 * Narrowing to a client is what filing a NEW case starts with, since a
 * conversation only exists inside one client's history.
 */
export default function ReplayIndexPage() {
  const [picking, setPicking] = useState(false);
  const [count, setCount] = useState<{ resolved: number; total: number } | null>(null);

  const onCount = useCallback(
    (resolved: number, total: number) => setCount({ resolved, total }),
    [],
  );

  return (
    <div>
      <div className="library-header">
        <div>
          <Link href="/lab" className="back-link">
            <IconArrowLeft size={14} /> Lab
          </Link>
          <h1 className="library-title">Replay</h1>
          <p className="section-label library-subtitle">
            {count && count.total > 0
              ? `${count.resolved} de ${count.total} ${count.total === 1 ? "caso resuelto" : "casos resueltos"}`
              : "Conversaciones reales que ya ocurrieron: encuentra la que falló, márcala y comprueba si tu cambio la arregla"}
          </p>
        </div>
        <Button variant="primary" onClick={() => setPicking(true)}>
          <IconPlus size={15} /> Nuevo caso
        </Button>
      </div>

      <CaseList onCount={onCount} />

      <NewCaseModal open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

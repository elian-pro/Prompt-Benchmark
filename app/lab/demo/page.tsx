"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconCopy,
  IconCheck,
  IconLink,
  IconLock,
  IconLockOpen,
  IconPlus,
} from "@tabler/icons-react";

import type { DemoLinkListItem } from "@/lib/db/demo-links";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { NewDemoLinkModal } from "@/components/demo/NewDemoLinkModal";

/**
 * Every demo link, newest first.
 *
 * The two numbers on each row are the ones that decide what to do next: how
 * many people used it, and how many of their reports are still waiting. A link
 * with pending notes is the reason to open this page at all.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DemoLinksPage() {
  const [links, setLinks] = useState<DemoLinkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-links");
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar los links.");
      setLinks(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(token: string) {
    const url = `${window.location.origin}/prueba/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      window.setTimeout(() => setCopied((cur) => (cur === token ? null : cur)), 2000);
    } catch {
      setError("No se pudo copiar. Copia la URL a mano: " + url);
    }
  }

  async function toggleStatus(link: DemoLinkListItem) {
    try {
      const res = await fetch(`/api/demo-links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: link.status === "active" ? "closed" : "active" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "No se pudo cambiar el link.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cambiar el link.");
    }
  }

  return (
    <div>
      <div className="library-header">
        <div>
          <h1 className="library-title">Demo</h1>
          <p className="section-label library-subtitle">
            Links de prueba para que el cliente valide su agente
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setNewOpen(true)}
          icon={<IconPlus size={14} stroke={1.5} />}
        >
          Nuevo link
        </Button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading && <SkeletonRows count={3} />}

      {!loading && links.length === 0 && (
        <EmptyState
          icon={<IconLink size={22} />}
          title="Todavía no hay links"
          description="Crea uno, mándaselo al cliente y sus conversaciones y reportes aparecen aquí."
        />
      )}

      <div className="demo-link-list">
        {links.map((link) => (
          <div key={link.id} className="demo-link-row">
            <Link href={`/lab/demo/${link.id}`} className="demo-link-main">
              <div className="demo-link-title">
                {link.client_name ?? "Cliente eliminado"}
                {link.label && <span className="demo-link-label">{link.label}</span>}
                {link.status === "closed" && <span className="note-status">Cerrado</span>}
              </div>
              <div className="demo-link-meta">
                <span>v{link.version_number_snapshot}</span>
                <span>·</span>
                <span>
                  {link.session_count} conversación{link.session_count === 1 ? "" : "es"}
                </span>
                <span>·</span>
                <span>{formatDate(link.created_at)}</span>
                {link.pending_notes > 0 && (
                  <span className="demo-link-pending">
                    {link.pending_notes} sin revisar
                  </span>
                )}
              </div>
            </Link>

            <div className="demo-link-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(link.token)}
                icon={
                  copied === link.token ? <IconCheck size={14} /> : <IconCopy size={14} />
                }
              >
                {copied === link.token ? "Copiado" : "Copiar link"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleStatus(link)}
                icon={
                  link.status === "active" ? <IconLock size={14} /> : <IconLockOpen size={14} />
                }
              >
                {link.status === "active" ? "Cerrar" : "Reabrir"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <NewDemoLinkModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />
    </div>
  );
}

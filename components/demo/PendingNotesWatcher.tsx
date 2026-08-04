"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";

/**
 * Tells the user when a client leaves a report, which is the whole point of
 * having handed out the link: the feedback used to arrive as a WhatsApp
 * message, so it announced itself. Here it just sits in the database.
 *
 * Same shape as GenerationWatcher: poll, show a badge, and fire a browser
 * notification for what appeared while the user was elsewhere. The count is the
 * state worth reacting to, so the announcement compares against the last count
 * seen rather than tracking individual note ids.
 */
type PendingLink = {
  link_id: string;
  client_name: string | null;
  label: string | null;
  count: number;
};

type Summary = { total: number; by_link: PendingLink[] };

const POLL_MS = 30_000;

/** Survives the full page reloads the header nav causes, the same reason
 *  GenerationWatcher keeps its state in localStorage. */
const SEEN_KEY = "zebra-pending-notes";

function readSeen(): number {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const n = raw === null ? null : Number(raw);
    return n === null || Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

function writeSeen(total: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(total));
  } catch {
    // Storage blocked: the badge still works, only the "new report" notice for
    // one that lands while the tab is in the background is lost.
  }
}

export function PendingNotesWatcher() {
  const [summary, setSummary] = useState<Summary>({ total: 0, by_link: [] });
  const firstPoll = useRef(true);

  const announce = useCallback((current: Summary, previous: number) => {
    // Only growth is news. A shrinking count means the user is reviewing them,
    // which they can already see.
    if (current.total <= previous) return;
    // The first poll after a reload compares against a count from before the
    // navigation, so announcing then would repeat what was already shown.
    if (firstPoll.current) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const top = current.by_link[0];
    const label = top?.client_name ?? "Un cliente";
    const fresh = current.total - previous;
    const notification = new Notification(
      fresh === 1 ? `${label} dejó un reporte` : `${fresh} reportes nuevos`,
      { body: "Ábrelo en Lab para revisarlo.", tag: "demo-pending-notes" },
    );
    notification.onclick = () => {
      window.focus();
      window.location.href = top ? `/lab/demo/${top.link_id}` : "/lab/demo";
    };
  }, []);

  const poll = useCallback(async () => {
    let current: Summary;
    try {
      const res = await fetch("/api/demo-links/pending-count");
      if (!res.ok) return;
      current = await res.json();
    } catch {
      // A failed poll must not reset the seen count, or the next successful one
      // would announce reports the user has already looked at.
      return;
    }
    announce(current, readSeen());
    writeSeen(current.total);
    setSummary(current);
    firstPoll.current = false;
  }, [announce]);

  useEffect(() => {
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  if (summary.total === 0) return null;

  const top = summary.by_link[0];
  return (
    <a
      href={summary.by_link.length === 1 && top ? `/lab/demo/${top.link_id}` : "/lab/demo"}
      title={
        summary.total === 1
          ? `Un reporte sin revisar${top?.client_name ? ` de ${top.client_name}` : ""}`
          : `${summary.total} reportes de clientes sin revisar`
      }
    >
      <Badge variant="new-version">
        {summary.total === 1 ? "1 reporte" : `${summary.total} reportes`}
      </Badge>
    </a>
  );
}

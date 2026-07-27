"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";

type Turn = { sessionId: string; mode: "editor" | "creator"; title: string };

const POLL_MS = 5000;

/**
 * Which sessions were generating the last time we looked. Kept in
 * localStorage, not React state, because every section change in this app is a
 * full page reload (the header nav uses plain anchors), so component state
 * cannot survive the exact moment this needs to compare against: a turn that
 * was running before the navigation and finished after it.
 */
const SEEN_KEY = "zebra-generating";

function readSeen(): Turn[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSeen(turns: Turn[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(turns));
  } catch {
    // Storage full or blocked: the chip still works, only the completion
    // notice for a turn that finishes off-screen is lost.
  }
}

function sessionHref(turn: Turn) {
  return `/${turn.mode}/${turn.sessionId}`;
}

/**
 * Watches for Editor and Creator turns generating anywhere in the app, so the
 * user can start one and walk away. Shows a chip in the header while something
 * is running, and announces each turn that finishes while they were looking at
 * another section, both in-app and (with permission) as a browser notification
 * so it also lands when the app is not the active tab.
 */
export function GenerationWatcher() {
  const [running, setRunning] = useState<Turn[]>([]);
  const [finished, setFinished] = useState<Turn | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((turn: Turn) => {
    // Already looking at it: the stream landed on screen, saying so again is
    // noise.
    if (window.location.pathname.endsWith(turn.sessionId)) return;

    setFinished(turn);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setFinished(null), 8000);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const label = turn.mode === "creator" ? "Creator" : "Editor";
      const notification = new Notification(`${label}: respuesta lista`, {
        body: turn.title,
        tag: turn.sessionId,
      });
      notification.onclick = () => {
        window.focus();
        window.location.href = sessionHref(turn);
      };
    }
  }, []);

  const poll = useCallback(async () => {
    let current: Turn[];
    try {
      const res = await fetch("/api/chat-sessions/generating");
      if (!res.ok) return;
      current = await res.json();
    } catch {
      // A failed poll must not clear the seen list, or the turn it was
      // tracking would silently stop counting as in flight.
      return;
    }
    const ids = new Set(current.map((t) => t.sessionId));
    for (const turn of readSeen()) {
      if (!ids.has(turn.sessionId)) announce(turn);
    }
    writeSeen(current);
    setRunning(current);
  }, [announce]);

  useEffect(() => {
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    // Browsers throttle timers in background tabs to about once a minute, so
    // catch up the moment the user looks at the app again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [poll]);

  return (
    <>
      {running.length > 0 && (
        <a
          href={sessionHref(running[0])}
          title={
            running.length === 1
              ? `Generando respuesta: ${running[0].title}`
              : `${running.length} respuestas en curso`
          }
        >
          <Badge variant="new-version">
            {running.length === 1 ? "Generando" : `Generando ${running.length}`}
          </Badge>
        </a>
      )}
      {finished && (
        <a className="toast" href={sessionHref(finished)}>
          {finished.mode === "creator" ? "Creator" : "Editor"}: la respuesta de{" "}
          {finished.title} está lista. Toca para verla.
        </a>
      )}
    </>
  );
}

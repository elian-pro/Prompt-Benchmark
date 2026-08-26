"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconBell, IconPencil, IconSparkles, IconUser } from "@tabler/icons-react";

import {
  pushLog,
  finishedTurns,
  LOG_KEY,
  type NotifEntry,
  type NotifKind,
} from "@/lib/notifications";

/**
 * The header's single notification slot: what needs attention now, plus the
 * history of what has been announced.
 *
 * Replaces GenerationWatcher and PendingNotesWatcher, which were the same
 * component written twice (poll, compare against what was last seen, badge,
 * browser notification) and were growing one chip each. Both polls live on
 * here with their own cadences: a generation finishes in seconds, a client's
 * report can wait half a minute.
 *
 * Everything survives the full page reloads the header nav causes by living in
 * localStorage, which is also why the seen-state keys are unchanged: an
 * in-flight turn from before this shipped is still tracked after it.
 */
type Turn = { sessionId: string; mode: "editor" | "creator"; title: string };

type PendingLink = {
  link_id: string;
  client_name: string | null;
  label: string | null;
  count: number;
};

type Summary = { total: number; by_link: PendingLink[] };

const GENERATING_POLL_MS = 5_000;
const NOTES_POLL_MS = 30_000;

const GENERATING_KEY = "zebra-generating";
const NOTES_KEY = "zebra-pending-notes";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the bell still shows what is pending. Only the
    // history and the "finished while you were away" notice are lost.
  }
}

function readSeenTurns(): Turn[] {
  const parsed = readJson<Turn[]>(GENERATING_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

/** The previous pending-report count. Written by the older watcher as a bare
 *  number, so it is read as one rather than as JSON. */
function readSeenNotes(): number {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const n = raw === null ? null : Number(raw);
    return n === null || Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

function writeSeenNotes(total: number) {
  try {
    localStorage.setItem(NOTES_KEY, String(total));
  } catch {
    // See writeJson.
  }
}

function sessionHref(turn: Turn) {
  return `/${turn.mode}/${turn.sessionId}`;
}

function linkHref(link: PendingLink | undefined) {
  return link ? `/lab/demo/${link.link_id}` : "/lab/demo";
}

function modeLabel(mode: Turn["mode"]) {
  return mode === "creator" ? "Creator" : "Editor";
}

/** Same icon a section wears in the header nav, so an entry says where it came
 *  from before the sentence is read. A client's report is the third origin and
 *  has no nav item of its own: it is a person, not a section. */
function NotifIcon({ kind }: { kind: NotifKind | undefined }) {
  const Icon = kind === "creator" ? IconSparkles : kind === "note" ? IconUser : IconPencil;
  if (!kind) return null;
  return <Icon className="notif-icon" size={14} stroke={1.5} />;
}

/** Renders `text` with its one emphasized run in the foreground color. Nothing
 *  to emphasize, or a term that is not in the text (an entry logged before the
 *  field existed): the plain sentence. */
function emphasized(text: string, term: string | undefined) {
  const at = term ? text.indexOf(term) : -1;
  if (at < 0 || !term) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong>{term}</strong>
      {text.slice(at + term.length)}
    </>
  );
}

function formatWhen(at: number) {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

let audio: AudioContext | null = null;

/** A short two tone chime, synthesized so there is no asset to ship and no
 *  request to make. Browsers only let audio play once the user has interacted
 *  with the page, so before the first click this is silently a no op, which is
 *  fine: nothing is waiting on a notification that early. */
function chime() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1320, t + 0.11);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  } catch {
    // No audio device, or the browser blocked it. Never worth breaking a
    // notification over.
  }
}

function notify(title: string, body: string, tag: string, href: string) {
  // Before the permission guard: the bell logged the event either way, so it
  // is worth hearing even when the OS notification itself was never allowed.
  chime();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, tag });
  notification.onclick = () => {
    window.focus();
    window.location.href = href;
  };
}

export function NotificationsBell() {
  const [running, setRunning] = useState<Turn[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, by_link: [] });
  const [log, setLog] = useState<NotifEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState<Turn | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstNotesPoll = useRef(true);

  /** One place where an announced event becomes history, so the log and the
   *  browser notification can never disagree about what happened. */
  const record = useCallback((entries: NotifEntry[]) => {
    if (entries.length === 0) return;
    setLog((current) => {
      const next = pushLog(current, entries);
      if (next !== current) writeJson(LOG_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    setLog(readJson<NotifEntry[]>(LOG_KEY, []));
  }, []);

  const pollGenerating = useCallback(async () => {
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
    const done = finishedTurns(readSeenTurns(), current);
    const at = Date.now();
    record(
      done.map((turn) => ({
        id: `turn-${turn.sessionId}-${at}`,
        at,
        text: `${modeLabel(turn.mode)}: la respuesta de ${turn.title} está lista.`,
        href: sessionHref(turn),
        kind: turn.mode,
        emphasis: turn.title,
      })),
    );
    for (const turn of done) {
      // Already looking at it: the stream landed on screen, saying so again is
      // noise. The history entry above still records it.
      if (window.location.pathname.endsWith(turn.sessionId)) continue;
      setFinished(turn);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setFinished(null), 8000);
      notify(
        `${modeLabel(turn.mode)}: respuesta lista`,
        turn.title,
        turn.sessionId,
        sessionHref(turn),
      );
    }
    writeJson(GENERATING_KEY, current);
    setRunning(current);
  }, [record]);

  const pollNotes = useCallback(async () => {
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
    const previous = readSeenNotes();
    const fresh = current.total - previous;
    // Only growth is news. A shrinking count means the user is reviewing them,
    // which they can already see. The first poll after a reload compares
    // against a count from before the navigation, so announcing then would
    // repeat what was already shown.
    if (fresh > 0 && !firstNotesPoll.current) {
      const top = current.by_link[0];
      const name = top?.client_name ?? "Un cliente";
      const text = fresh === 1 ? `${name} dejó un reporte.` : `${fresh} reportes nuevos.`;
      const at = Date.now();
      record([
        {
          id: `notes-${at}-${current.total}`,
          at,
          text,
          href: linkHref(top),
          kind: "note",
          emphasis: fresh === 1 ? name : undefined,
        },
      ]);
      notify(text, "Ábrelo en Lab para revisarlo.", "demo-pending-notes", linkHref(top));
    }
    writeSeenNotes(current.total);
    setSummary(current);
    firstNotesPoll.current = false;
  }, [record]);

  useEffect(() => {
    const run = () => {
      void pollGenerating();
      void pollNotes();
    };
    run();
    const fast = setInterval(() => void pollGenerating(), GENERATING_POLL_MS);
    const slow = setInterval(() => void pollNotes(), NOTES_POLL_MS);
    // Browsers throttle timers in background tabs to about once a minute, so
    // catch up the moment the user looks at the app again.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
      document.removeEventListener("visibilitychange", onVisible);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pollGenerating, pollNotes]);

  // The count is what is still waiting on someone, not how much has been
  // announced: reports nobody has reviewed, and turns still generating.
  const pending = summary.total + running.length;

  return (
    <div className="notif">
      <button
        type="button"
        className="notif-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={pending === 0 ? "Notificaciones" : `Notificaciones (${pending})`}
        aria-expanded={open}
        title="Notificaciones"
      >
        <IconBell size={16} stroke={1.5} />
        {pending > 0 && <span className="notif-count">{pending}</span>}
      </button>

      {open && (
        <>
          <div className="chip-select-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-section">
              <span className="notif-section-title">Pendientes</span>
              {pending === 0 && <p className="notif-empty">Nada pendiente.</p>}
              <div className="notif-list notif-list-pending">
                {summary.by_link.map((link) => (
                  <a
                    key={link.link_id}
                    className="notif-item notif-item-pending"
                    href={linkHref(link)}
                  >
                    {/* Only an unreviewed report gets the dot: it is the one
                        thing here that is waiting on the user rather than on
                        the machine. */}
                    <span className="notif-dot" aria-hidden="true" />
                    <NotifIcon kind="note" />
                    <span className="notif-item-text">
                      <strong>{link.client_name ?? "Un cliente"}</strong>:{" "}
                      {link.count === 1
                        ? "1 reporte sin revisar"
                        : `${link.count} reportes sin revisar`}
                    </span>
                  </a>
                ))}
                {running.map((turn) => (
                  <a
                    key={turn.sessionId}
                    className="notif-item notif-item-pending"
                    href={sessionHref(turn)}
                  >
                    <NotifIcon kind={turn.mode} />
                    <span className="notif-item-text">
                      {modeLabel(turn.mode)}: generando respuesta en <strong>{turn.title}</strong>
                    </span>
                  </a>
                ))}
              </div>
            </div>

            <div className="notif-section">
              <span className="notif-section-title">Historial</span>
              {log.length === 0 && <p className="notif-empty">Aquí se acumula lo que pase.</p>}
              <div className="notif-list">
                {log.map((e) => (
                  <a key={e.id} className="notif-item" href={e.href}>
                    <NotifIcon kind={e.kind} />
                    <span className="notif-item-text">{emphasized(e.text, e.emphasis)}</span>
                    <span className="notif-item-time">{formatWhen(e.at)}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {finished && (
        <a className="toast" href={sessionHref(finished)}>
          {modeLabel(finished.mode)}: la respuesta de {finished.title} está lista. Toca para verla.
        </a>
      )}
    </div>
  );
}

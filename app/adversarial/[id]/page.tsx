"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import type { RunDetail, RunMessageRole, ReportRow } from "@/lib/db/runs";
import { PRESET_LABELS } from "@/lib/prompts/adversarial-personas";
import { parseTurn } from "@/lib/adversarial-message";
import { relativeTimeEs } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  completed: "Completada",
  stopped: "Detenida",
  error: "Error",
};

type LiveMessage = { turn: number; role: RunMessageRole; content: string };

function Turn({ role, content }: { role: RunMessageRole; content: string }) {
  // Bot under test reads like the assistant; the adversarial lead like the user.
  const cls = role === "bot" ? "chat-assistant" : "chat-user";
  const { message, state } = parseTurn(content);
  return (
    <div className={`chat-bubble ${cls}`}>
      <span className="chat-role">{role === "bot" ? "Agente (bot)" : "Lead"}</span>
      <div className="chat-content">
        {message ? (
          message
        ) : (
          <span className="chat-empty">— el agente no envió mensaje —</span>
        )}
      </div>
      {state && (
        <div className="chat-state">
          <span className="chat-state-label">Estado</span>
          <span className="chat-state-value">{state}</span>
        </div>
      )}
    </div>
  );
}

// Shown for a turn in progress. Nothing is revealed until the model's full
// reply is ready (see the run engine) — this is deliberate: it's what keeps a
// bot's raw JSON or a lead's leaked stage direction from ever flashing on
// screen mid-generation.
function TypingIndicator({ role }: { role: RunMessageRole }) {
  const cls = role === "bot" ? "chat-assistant" : "chat-user";
  return (
    <div className={`chat-bubble ${cls}`}>
      <span className="chat-role">{role === "bot" ? "Agente (bot)" : "Lead"}</span>
      <div className="chat-content chat-typing">
        Escribiendo
        <span className="typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

function ReportView({ report }: { report: ReportRow }) {
  return (
    <section className="report-panel">
      <p className="section-label" style={{ marginBottom: 10 }}>
        Reporte del juez
      </p>
      <p className="report-summary">{report.summary}</p>

      {report.findings.length === 0 ? (
        <p className="field-hint">El juez no detectó fallas.</p>
      ) : (
        <div className="finding-list">
          {report.findings.map((f, i) => (
            <div key={i} className="finding">
              <div className="finding-head">
                <span className="finding-category">{f.category}</span>
                <span className={`severity severity-${f.severity}`}>{f.severity}</span>
              </div>
              <p className="finding-text">
                <strong>Hipótesis:</strong> {f.hypothesis}
              </p>
              <p className="finding-text">
                <strong>Sugerencia:</strong> {f.fix}
              </p>
            </div>
          ))}
        </div>
      )}

      {report.edge_cases.length > 0 && (
        <>
          <p className="section-label" style={{ margin: "16px 0 8px" }}>
            Casos límite
          </p>
          <ul className="report-edge-cases">
            {report.edge_cases.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      )}

      {report.scope_disclaimer && (
        <p className="field-hint" style={{ marginTop: 16 }}>
          {report.scope_disclaimer}
        </p>
      )}
    </section>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live execution state (used when this page kicks off a pending run).
  const [executed, setExecuted] = useState(false);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [typingRole, setTypingRole] = useState<RunMessageRole | null>(null);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "judging" | "done" | "error">("idle");
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/runs/${id}`);
    if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar.");
    return (await res.json()) as RunDetail;
  }, [id]);

  const execute = useCallback(async () => {
    setExecuted(true);
    setPhase("running");
    try {
      const res = await fetch(`/api/runs/${id}/execute`, { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo ejecutar.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "turn_start") {
            setTypingRole(evt.role);
          } else if (evt.type === "turn_end") {
            setTypingRole(null);
            setLiveMessages((prev) => [
              ...prev,
              { turn: evt.turn, role: evt.role, content: evt.content },
            ]);
          } else if (evt.type === "judging") {
            setPhase("judging");
          } else if (evt.type === "report") {
            setReport(evt.report as ReportRow);
          } else if (evt.type === "status" && evt.status === "completed") {
            setPhase("done");
          } else if (evt.type === "error") {
            setError(evt.message);
            setPhase("error");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al ejecutar la prueba.");
      setPhase("error");
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await load();
        if (cancelled) return;
        setRun(data);
        // A freshly created run auto-executes; otherwise show stored results.
        if (data.status === "pending" && !startedRef.current) {
          startedRef.current = true;
          execute();
        } else {
          setReport(data.report);
          setPhase(data.status === "running" ? "running" : "done");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar la prueba.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, execute]);

  // Keep scrolled to the latest turn as the conversation streams.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [liveMessages.length, typingRole, report]);

  if (loading) return <p className="empty-hint">Cargando…</p>;
  if (error && !run) return <p className="form-error">{error}</p>;
  if (!run) return <p className="empty-hint">Prueba no encontrada.</p>;

  // Show live messages when we executed here; otherwise the stored transcript.
  const messages: LiveMessage[] = executed
    ? liveMessages
    : run.messages.map((m) => ({ turn: m.turn_number, role: m.role, content: m.content }));
  const shownReport = report ?? run.report;
  const statusLabel =
    phase === "judging" ? "Analizando con el juez…" : STATUS_LABELS[run.status] ?? run.status;
  const statusClass = phase === "error" ? "error" : phase === "done" ? "completed" : "running";

  return (
    <div>
      <div className="detail-header">
        <div>
          <Link href="/adversarial" className="back-link">
            <IconArrowLeft size={13} /> Adversarial Lab
          </Link>
          <h1 className="detail-title">{run.client_name ?? "Cliente eliminado"}</h1>
          <div className="detail-sub">
            <span className={`session-status status-${statusClass}`}>{statusLabel}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {PRESET_LABELS[run.preset]} · intensidad {run.intensity} ·{" "}
              {run.version_number_snapshot} · {relativeTimeEs(run.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && phase === "running" && !typingRole && (
          <p className="empty-hint">Iniciando conversación…</p>
        )}
        {messages.map((m) => (
          <Turn key={m.turn} role={m.role} content={m.content} />
        ))}
        {typingRole && <TypingIndicator role={typingRole} />}
      </div>

      {phase === "error" && error && (
        <p className="form-error" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {shownReport && (
        <div style={{ marginTop: 24 }}>
          <ReportView report={shownReport} />
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { Attachment } from "@/lib/db/chat-sessions";
import { DotGrid } from "@/components/sessions/DotGrid";
import { IdleComposer } from "@/components/sessions/IdleComposer";
import { SessionChat } from "@/components/sessions/SessionChat";

type Mode = "editor" | "creator";
type FirstMessage = { content: string; attachments: Attachment[] } | undefined;

/**
 * Root of the Editor/Creator tab. Picking a client and sending never
 * navigates — this component just swaps its own view between the welcome
 * composer and the live chat, in place. The URL is updated silently
 * (history.replaceState, not router navigation) purely so the session can be
 * refreshed or shared; it never triggers a remount or route transition.
 *
 * `/[mode]/[id]/page.tsx` still exists as a thin wrapper around SessionChat
 * for direct/deep links (e.g. "Editar con IA" from the Library) — this
 * component is only the entry point reached from `/editor` and `/creator`.
 */
export function SessionWorkspace({ mode }: { mode: Mode }) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [autoSend, setAutoSend] = useState<FirstMessage>(undefined);

  function goActive(sessionId: string, firstMessage?: FirstMessage) {
    setActiveSessionId(sessionId);
    setAutoSend(firstMessage);
    window.history.replaceState(null, "", `/${mode}/${sessionId}`);
  }

  function goIdle() {
    setActiveSessionId(null);
    setAutoSend(undefined);
    window.history.replaceState(null, "", `/${mode}`);
  }

  if (activeSessionId) {
    return (
      <SessionChat
        key={activeSessionId}
        sessionId={activeSessionId}
        mode={mode}
        onBack={goIdle}
        autoSend={autoSend}
      />
    );
  }

  return (
    <>
      <DotGrid />
      <IdleComposer
        mode={mode}
        onStarted={(sessionId, firstMessage) => goActive(sessionId, firstMessage)}
        onResumeHistory={(sessionId) => goActive(sessionId)}
      />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DotGrid } from "@/components/sessions/DotGrid";
import { SessionChat } from "@/components/sessions/SessionChat";

/**
 * Direct/deep link into an existing Editor session (e.g. "Editar con IA" from
 * the Library, a bookmark, or a page refresh after SessionWorkspace's silent
 * URL update). The primary "pick a client and go" flow never lands here — it
 * stays on `/editor` — so "back" here is a real navigation, unlike the inline
 * workspace's in-place `onBack`.
 *
 * Also the landing spot for a Playground "Enviar al Editor" handoff (Sprint
 * 6, T4): the handoff drops its composed first message in sessionStorage
 * keyed by this session's id right before navigating in, then this page
 * reads and clears it once, so a later refresh shows a normal composer
 * instead of repeating the pre-fill.
 */
export default function EditorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [initialDraft, setInitialDraft] = useState<string | undefined>(undefined);
  useEffect(() => {
    const key = `playground-handoff:${id}`;
    const stored = window.sessionStorage.getItem(key);
    if (stored) {
      window.sessionStorage.removeItem(key);
      setInitialDraft(stored);
    }
  }, [id]);

  return (
    <>
      <DotGrid />
      <SessionChat
        sessionId={id}
        mode="editor"
        onBack={() => router.push("/editor")}
        initialDraft={initialDraft}
      />
    </>
  );
}
